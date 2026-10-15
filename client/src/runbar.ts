import { showOnScreen, startApp, stopSandcastle, type ProjectSummary } from './api';

// The Sandcastle runs going, started from the office: a strip for each along the bottom of the screen, in
// the office and on the computer's taskbar, so you can see what it's on wherever you are, and open its app.

/** What the strip's buttons do where it is: watch the app in the office, and fetch the projects again. */
export interface RunActions {
  watch(id: string): void;
  refresh(): void;
}

const TITLES: Record<string, string> = { planner: 'Planner', implementer: 'Implementer', reviewer: 'Reviewer', merger: 'Merger' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, title: string, act: () => unknown, primary = false) {
  const b = el('button', primary ? 'primary' : '', text);
  b.title = title;
  b.onclick = (e) => {
    e.stopPropagation();
    void Promise.resolve(act()).catch((err: Error) => alert(err.message));
  };
  return b;
}

/** Draws a strip into `box` for each project Sandcastle is running in; hides `box` if there are none. */
export function drawRuns(box: HTMLElement, projects: ProjectSummary[], actions: RunActions) {
  const runs = projects.filter((p) => p.sandcastleStarted);
  box.hidden = !runs.length;
  box.innerHTML = '';
  for (const p of runs) {
    const strip = el('div', 'run');
    const who = (p.busy ?? []).map((r) => TITLES[r] ?? r).join(', ');
    const text = el('span', 'run-text');
    text.append(el('strong', '', `🏰 ${p.name}`), el('span', '', ` · ${p.sandcastleIssue ?? 'planning'}${who ? ` · ${who} working` : ''}`));
    text.title = p.sandcastleOutput.join('\n');
    strip.append(text);
    if (p.running && p.url) {
      strip.append(
        button('🏢 Watch in office', 'Open its app in a window on the office computer', () => actions.watch(p.id), true),
        button('🖥️ On my screen', 'Open its app in your normal browser, outside the office', () => showOnScreen(p.id)),
      );
    } else if (p.runnable && !p.started) {
      strip.append(button('▶ Run app', 'Start its app, to watch it', () => startApp(p.id).then(actions.refresh)));
    } else if (p.started) strip.append(el('span', 'muted small', 'App starting…'));
    strip.append(button('■ Stop', 'Stop Sandcastle', () => stopSandcastle(p.id).then(actions.refresh)));
    box.append(strip);
  }
}
