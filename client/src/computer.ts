import { fileIssue, showOnScreen, startApp, stopApp, type ProjectSummary } from './api';
import { GAMES, type RetroArcade } from './games/arcade';
import { STATUS_BULB } from './vendor/agent-office/character/agent';

// The CEO's computer, sat at up close: a retro desktop filling the screen, with a Games folder (the
// arcade), a Projects folder (each app, what it's for and the port it runs on), a shortcut to each app
// (run and stopped from here, and opened in a window here once it's up), and a notepad for writing an issue (what's wrong and what
// you want), kept as a draft or filed on GitHub for the Planner.

type View = 'desktop' | 'games' | 'game' | 'projects' | 'issue' | 'app';

const TITLES: Record<View, string> = {
  desktop: '',
  games: '📁 Games',
  game: '🕹️ ',
  projects: '📁 Projects',
  issue: '📝 New issue',
  app: '🖥️ ',
};
const DRAFTS_KEY = 'pixel-office.issues';
const TABS = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#9d4edd', '#e9c46a', '#ff8fab', '#264653'];
const GAME_ICONS: Record<string, string> = { blocks: '🧱', snake: '🐍', invaders: '👾', breakout: '🏓', pong: '🎾' };

/** An issue written on the computer: a draft, or filed (with where). */
interface Draft {
  id: string;
  project: string;
  title: string;
  problem: string;
  want: string;
  saved: number;
  url?: string;
}

/** What the computer needs from the office: the projects, which is open, and fetching them again. */
export interface Desk {
  projects(): ProjectSummary[];
  current(): string;
  refresh(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Computer {
  view: View = 'desktop';
  private drafts: Draft[];
  /** The draft the form is editing, if it's been saved. */
  private editing: string | null = null;
  private clock = 0;
  private poll = 0;
  /** The project whose app the app window shows, and why it couldn't run it, if it couldn't. */
  private appId: string | null = null;
  private appError = '';
  /** Whether the app window shows the app itself, or (till you pick) where to watch it. */
  private watching = false;

  constructor(
    private arcade: RetroArcade,
    private desk: Desk,
  ) {
    try {
      this.drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '[]') ?? [];
    } catch {
      this.drafts = [];
    }
    for (const b of document.querySelectorAll<HTMLElement>('[data-open]')) b.onclick = () => this.open(b.dataset.open as View);
    $('pc-win-close').onclick = () => this.back();
    $('pc-win-stop').onclick = () => this.appId && void this.stop(this.appId);
    $('pc-app-run').onclick = () => this.appId && void this.run(this.appId);
    $('pc-app-here').onclick = () => this.appId && this.open('app', this.appId, true);
    $('pc-app-screen').onclick = () => this.appId && void this.toScreen(this.appId);
    $('pc-off').onclick = () => this.onLeave();
    $('pc-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
    $('issue-save').onclick = () => this.save();
    $('issue-file').onclick = () => void this.file();
    $('issue-new').onclick = () => this.edit(null);
    $<HTMLFormElement>('pc-issue-form').onsubmit = (e) => e.preventDefault();
    this.drawGames();
  }

  /** Set by the page: getting up from the computer. */
  onLeave = () => {};

  show() {
    $('pc').hidden = false;
    this.open('desktop');
    this.tick();
    this.clock = window.setInterval(() => this.tick(), 10_000);
    // While an app's starting up, keep asking whether it's up yet.
    this.poll = window.setInterval(() => this.desk.projects().some((p) => p.started && !p.running) && this.desk.refresh(), 1000);
  }

  hide() {
    this.arcade.hide();
    $('pc').hidden = true;
    clearInterval(this.clock);
    clearInterval(this.poll);
  }

  /** Opens a window: a game or a project's app by id, for those; an app's shown in it if `watch`, else it asks where. */
  open(view: View, id?: string, watch = false) {
    if (this.view === 'game' && view !== 'game') this.arcade.hide();
    // Closing an app's window unloads it, as closing it would.
    if (view !== 'app') this.load(null);
    this.view = view;
    $('pc-win-stop').hidden = true;
    $('pc-win-out').hidden = true;
    $('pc-win').hidden = view === 'desktop';
    for (const v of ['games', 'game', 'projects', 'issue', 'app'] as const) $(`pc-${v}`).hidden = v !== view;
    const game = GAMES.find((g) => g.id === id);
    const app = this.desk.projects().find((p) => p.id === id);
    $('pc-win-title').textContent = TITLES[view] + (view === 'game' && game ? game.name : view === 'app' && app ? app.name : '');
    $('pc-task').textContent = view === 'desktop' ? '' : $('pc-win-title').textContent;
    if (view === 'game' && game) {
      this.arcade.play(game.id);
      this.arcade.show();
    } else if (view === 'app' && app) {
      this.appId = app.id;
      this.watching = watch;
      this.drawApp();
    } else if (view === 'projects') {
      this.drawProjects();
      this.desk.refresh();
    } else if (view === 'issue') {
      this.drawIssue();
      if (!$<HTMLInputElement>('issue-title').value) $('issue-title').focus();
    }
  }

  /** Esc: out of a game to the Games folder, a window to the desktop; false once there's nothing left to close. */
  back(): boolean {
    if (this.view === 'desktop') return false;
    if (this.view === 'game') {
      this.arcade.back();
      this.open('games');
    } else this.open('desktop');
    return true;
  }

  /** The projects changed (they're fetched every few seconds): redraws what shows them. */
  refresh() {
    if (this.view === 'app') this.drawApp();
    else if (this.view === 'projects') this.drawProjects();
    else if (this.view === 'issue') this.drawProjectChoice();
  }

  private tick() {
    $('pc-clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /** The app window: the app once it's up; till then, how it's getting on, and what its server's printed. */
  private drawApp() {
    const p = this.desk.projects().find((o) => o.id === this.appId);
    if (!p) return;
    const up = p.running && !!p.url;
    const shown = up && this.watching;
    $('pc-win-stop').hidden = !p.started;
    $('pc-win-out').hidden = !shown;
    $('pc-win-out').onclick = () => void this.toScreen(p.id);
    $('pc-app-boot').hidden = shown;
    $('pc-app-frame').hidden = !shown;
    this.load(shown ? p.url : null);
    if (shown) return;
    $('pc-app-here').hidden = $('pc-app-screen').hidden = !up;
    $('pc-app-state').textContent = up
      ? `${p.name} is running on port ${p.port}. Where do you want to watch it?`
      : this.appError
      ? `Couldn’t run ${p.name}: ${this.appError}`
      : p.started
        ? `Starting ${p.name}…`
        : p.exitCode !== null && ![0, -15, 143].includes(p.exitCode)
          ? `${p.name} stopped (exit code ${p.exitCode})`
          : `${p.name} isn’t running`;
    $('pc-app-run').hidden = up || !p.runnable || p.started;
    const feed = $('pc-app-output');
    feed.innerHTML = '';
    for (const line of p.output.length ? p.output : [p.runnable ? 'Its server’s output shows here.' : 'Start it outside, or give it "run" in projects.json to run it from here.']) feed.append(el('div', '', line));
    feed.scrollTop = feed.scrollHeight;
  }

  /** Points the app window at `url` (or nothing), only if it isn't there already: reloading would lose your place. */
  private load(url: string | null) {
    const frame = $<HTMLIFrameElement>('pc-app-frame');
    if ((frame.dataset.url ?? null) === url) return;
    if (url) frame.dataset.url = url;
    else delete frame.dataset.url;
    frame.src = url ?? 'about:blank';
  }

  /** Starts the app's server; `show` opens its window to watch it start, else it starts where you are. */
  private async run(id: string, show = true) {
    this.appError = '';
    try {
      await startApp(id);
    } catch (e) {
      this.appError = (e as Error).message;
      if (!show) alert(`Couldn’t run it: ${this.appError}`);
    }
    if (show) this.open('app', id);
    this.desk.refresh();
  }

  private async toScreen(id: string) {
    try {
      await showOnScreen(id);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  private async stop(id: string) {
    try {
      await stopApp(id);
    } catch (e) {
      this.appError = (e as Error).message;
    }
    this.desk.refresh();
  }

  private drawGames() {
    const box = $('pc-games');
    box.innerHTML = '';
    for (const g of GAMES) {
      const b = el('button', 'icon');
      b.append(el('span', 'glyph', GAME_ICONS[g.id] ?? '🎮'), el('span', 'name', g.name));
      b.title = g.blurb;
      b.onclick = () => this.open('game', g.id);
      box.append(b);
    }
  }

  private drawProjects() {
    const box = $('pc-projects');
    const list = this.desk.projects();
    box.innerHTML = '';
    if (!list.length) box.append(el('p', 'muted', 'No projects yet: list them in projects.json.'));
    list.forEach((p, i) => {
      const card = el('div', `app${p.id === this.desk.current() ? ' on' : ''}`);
      const head = el('div', 'app-head');
      const tab = el('i', 'tab');
      tab.style.background = TABS[i % TABS.length];
      head.append(tab, el('strong', '', p.name));
      if (p.id === this.desk.current()) head.append(el('span', 'pill', 'in the office'));
      card.append(head);
      card.append(el('p', p.description ? '' : 'muted', p.description ?? 'No description: add one to its package.json or README, or "description" in projects.json.'));

      const port = el('div', 'port');
      const dot = el('i', `dot ${p.running ? 'up' : 'down'}`);
      if (p.served && p.port) port.append(dot, el('span', '', `Running on port ${p.port} · its built ${p.served}/ folder`));
      else if (p.unbuilt) port.append(dot, el('span', 'muted', 'Not built yet: run its build, then it opens here'));
      else if (p.port) {
        const where = p.running ? `Running on port ${p.port}` : `Not running · ${p.portGuessed ? 'usually' : 'set to'} port ${p.port}`;
        port.append(dot, el('span', '', where + (p.portGuessed && p.running ? ' (guessed from its dev script)' : '')));
      } else port.append(dot, el('span', 'muted', 'No port known: add "port" in projects.json'));
      card.append(port);
      card.append(el('div', 'muted small mono', p.path));

      const counts = el('div', 'counts');
      for (const [s, n] of Object.entries(p.counts)) {
        const c = el('span', '', `${n} ${s}`);
        c.style.background = STATUS_BULB[s as keyof typeof STATUS_BULB];
        counts.append(c);
      }
      if (!p.found) counts.append(el('span', '', 'no .sandcastle folder'));

      const acts = el('div', 'acts');
      if (p.runnable && !p.started && !p.running) {
        const run = el('button', 'primary', '▶ Run');
        run.onclick = () => void this.run(p.id, false);
        acts.append(run);
      } else if (p.started) {
        const stop = el('button', '', '■ Stop');
        stop.onclick = () => void this.stop(p.id);
        acts.append(stop);
      }
      if (p.started && !p.running) acts.append(el('span', 'muted small', 'Starting…'));
      if (p.url && p.running) {
        const here = el('button', 'primary', '🏢 Watch in office');
        here.title = 'Open it in a window here on the office computer';
        here.onclick = () => this.open('app', p.id, true);
        acts.append(here);
      }
      if (p.url && p.running) {
        const out = el('button', '', '🖥️ On my screen');
        out.title = 'Open it in your normal browser, outside the office';
        out.onclick = () => void this.toScreen(p.id);
        acts.append(out);
      }
      const issue = el('button', '', '📝 New issue');
      issue.onclick = () => {
        this.edit(null);
        this.open('issue');
        $<HTMLSelectElement>('issue-project').value = p.id;
      };
      acts.append(issue);
      card.append(counts, acts);
      box.append(card);
    });
  }

  private drawProjectChoice() {
    const sel = $<HTMLSelectElement>('issue-project');
    const was = sel.value || this.desk.current();
    sel.innerHTML = '';
    for (const p of this.desk.projects()) {
      const o = el('option', '', p.name);
      o.value = p.id;
      sel.append(o);
    }
    sel.value = this.desk.projects().some((p) => p.id === was) ? was : this.desk.current();
  }

  private drawIssue() {
    this.drawProjectChoice();
    const list = $('issue-drafts');
    list.innerHTML = '';
    if (!this.drafts.length) list.append(el('p', 'muted small', 'Nothing saved yet.'));
    for (const d of [...this.drafts].sort((a, b) => b.saved - a.saved)) {
      const row = el('div', `draft${d.id === this.editing ? ' on' : ''}`);
      const name = this.desk.projects().find((p) => p.id === d.project)?.name ?? d.project;
      const pick = el('button', 'draft-pick');
      pick.append(el('strong', '', d.title || 'Untitled'), el('span', 'muted small', ` · ${name}`));
      pick.onclick = () => this.edit(d.id);
      row.append(pick);
      if (d.url) {
        const a = el('a', 'pill filed', 'filed ↗');
        a.href = d.url;
        a.target = '_blank';
        a.rel = 'noopener';
        row.append(a);
      } else row.append(el('span', 'pill', 'draft'));
      const x = el('button', 'draft-x', '✕');
      x.title = 'Delete';
      x.onclick = () => {
        this.drafts = this.drafts.filter((o) => o.id !== d.id);
        if (this.editing === d.id) this.edit(null);
        this.store();
        this.drawIssue();
      };
      row.append(x);
      list.append(row);
    }
    const filed = this.drafts.find((d) => d.id === this.editing)?.url;
    $<HTMLButtonElement>('issue-file').disabled = !!filed;
  }

  /** Loads a saved issue into the form, or (null) clears it for a new one. */
  private edit(id: string | null) {
    const d = this.drafts.find((o) => o.id === id);
    this.editing = d?.id ?? null;
    $<HTMLInputElement>('issue-title').value = d?.title ?? '';
    $<HTMLTextAreaElement>('issue-problem').value = d?.problem ?? '';
    $<HTMLTextAreaElement>('issue-want').value = d?.want ?? '';
    if (d) $<HTMLSelectElement>('issue-project').value = d.project;
    this.say(d?.url ? `Filed: ${d.url}` : '');
    this.drawIssue();
  }

  private form(): Draft {
    const old = this.drafts.find((o) => o.id === this.editing);
    return {
      id: old?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      project: $<HTMLSelectElement>('issue-project').value,
      title: $<HTMLInputElement>('issue-title').value.trim(),
      problem: $<HTMLTextAreaElement>('issue-problem').value.trim(),
      want: $<HTMLTextAreaElement>('issue-want').value.trim(),
      saved: Date.now(),
      url: old?.url,
    };
  }

  private keep(d: Draft) {
    this.drafts = [...this.drafts.filter((o) => o.id !== d.id), d];
    this.editing = d.id;
    this.store();
  }

  private save() {
    const d = this.form();
    if (!d.title && !d.problem && !d.want) return this.say('Write something first.');
    this.keep(d);
    this.say('Saved on this computer.');
    this.drawIssue();
  }

  private async file() {
    const d = this.form();
    const project = this.desk.projects().find((p) => p.id === d.project);
    if (!project) return this.say('Pick a project.');
    if (!d.title) return this.say('Give it a title first.');
    if (!d.problem && !d.want) return this.say('Say what’s wrong or what you want.');
    if (!confirm(`File this as a GitHub issue on ${project.name}'s repo? The Planner picks up open issues on its next run.`)) return;
    this.keep(d);
    const body = [d.problem && `## What's wrong\n\n${d.problem}`, d.want && `## What I want\n\n${d.want}`, `---\n_Filed from the CEO's computer in Sandcastle Pixel Office._`]
      .filter(Boolean)
      .join('\n\n');
    const btn = $<HTMLButtonElement>('issue-file');
    btn.disabled = true;
    this.say('Filing on GitHub…');
    try {
      d.url = await fileIssue(d.project, d.title, body);
      this.keep(d);
      this.say(`Filed: ${d.url}`);
    } catch (e) {
      this.say(`Couldn’t file it (kept as a draft): ${(e as Error).message}`);
    }
    if (this.view === 'issue') this.drawIssue();
  }

  private say(text: string) {
    $('issue-said').textContent = text;
  }

  private store() {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(this.drafts));
  }
}
