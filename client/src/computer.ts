import { fileIssue, type ProjectSummary } from './api';
import { GAMES, type RetroArcade } from './games/arcade';
import { STATUS_BULB } from './vendor/agent-office/character/agent';

// The CEO's computer, sat at up close: a retro desktop filling the screen, with a Games folder (the
// arcade), a Projects folder (each app, what it's for and the port it runs on), and a notepad for
// writing an issue (what's wrong and what you want), kept as a draft or filed on GitHub for the Planner.

type View = 'desktop' | 'games' | 'game' | 'projects' | 'issue';

const TITLES: Record<View, string> = {
  desktop: '',
  games: '📁 Games',
  game: '🕹️ ',
  projects: '📁 Projects',
  issue: '📝 New issue',
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

/** What the computer needs from the office: the projects, which is open, and switching to another. */
export interface Desk {
  projects(): ProjectSummary[];
  current(): string;
  choose(id: string): void;
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
  }

  hide() {
    this.arcade.hide();
    $('pc').hidden = true;
    clearInterval(this.clock);
  }

  open(view: View, gameId?: string) {
    if (this.view === 'game' && view !== 'game') this.arcade.hide();
    this.view = view;
    $('pc-win').hidden = view === 'desktop';
    for (const v of ['games', 'game', 'projects', 'issue'] as const) $(`pc-${v}`).hidden = v !== view;
    const game = GAMES.find((g) => g.id === gameId);
    $('pc-win-title').textContent = TITLES[view] + (view === 'game' && game ? game.name : '');
    $('pc-task').textContent = view === 'desktop' ? '' : $('pc-win-title').textContent;
    if (view === 'game' && game) {
      this.arcade.play(game.id);
      this.arcade.show();
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
    if (this.view === 'projects') this.drawProjects();
    else if (this.view === 'issue') this.drawProjectChoice();
  }

  private tick() {
    $('pc-clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      if (p.port) {
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
      if (p.url) {
        const open = el('a', `btn${p.running ? ' primary' : ''}`, p.running ? 'Open app ↗' : 'Try opening ↗');
        open.href = p.url;
        open.target = '_blank';
        open.rel = 'noopener';
        acts.append(open);
      }
      if (p.id !== this.desk.current()) {
        const watch = el('button', '', 'Watch in office');
        watch.onclick = () => this.desk.choose(p.id);
        acts.append(watch);
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
