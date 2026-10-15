import type { AgentStatus } from './vendor/agent-office/character/agent';
import type { Role } from './office';

// What server.py answers: the projects in the CEO's file stack, and one project's agents.

export interface ProjectSummary {
  id: string;
  name: string;
  /** Whether the project has a .sandcastle folder at all. */
  found: boolean;
  /** How many of its agents are in each status. */
  counts: Partial<Record<AgentStatus, number>>;
  branches: number;
  /** Where it is, with ~ for home. */
  path: string;
  /** What the app is for: from projects.json, its package.json, or its README. */
  description: string | null;
  /** The port its app runs on (from projects.json, or guessed from its dev scripts), whether something's listening there, and where to open it. */
  port: number | null;
  portGuessed: boolean;
  /** The folder Pixel Office serves its built app from (on `port`), if it does; or true if that folder isn't built yet. */
  served: string | null;
  unbuilt: boolean;
  /** Whether projects.json gives it a command to run its app; whether that's running, started from the computer (and how it ended, if it has); what it printed last. */
  runnable: boolean;
  started: boolean;
  exitCode: number | null;
  output: string[];
  running: boolean;
  url: string | null;
  /** Whether projects.json gives it a "sandcastle" command; whether a Sandcastle run started from here is going (and how it ended, if it has); what it printed last. */
  sandcastle: boolean;
  sandcastleStarted: boolean;
  sandcastleExitCode: number | null;
  sandcastleOutput: string[];
  /** The issue that run is on ("#14 FEAT-008: …"), once it's planned; and which of the project's agents are working. */
  sandcastleIssue: string | null;
  busy: string[];
}

export interface AgentSnapshot {
  role: Role;
  status: AgentStatus;
  log: string | null;
  updated: number | null;
  events: string[];
}

export interface StatusSnapshot {
  id: string;
  name: string;
  agents: AgentSnapshot[];
  branches: string[];
  time: number;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchProjects = () => get<{ projects: ProjectSummary[] }>('/api/projects').then((r) => r.projects);
async function post<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** Opens a GitHub issue on the project's repo, for the Planner to pick up: its address, and whether that started
 * Sandcastle there, found it already running, or couldn't start it (null if the project has no "sandcastle" command). */
export type IssueKind = 'feature' | 'bug' | null;
export const fileIssue = (project: string, title: string, body: string, kind: IssueKind = null) =>
  post<{ url: string; sandcastle: 'started' | 'running' | null; sandcastleError?: string | null }>('/api/issues', { project, title, body, kind });
/** Has Claude read the project and write the CEO's note up as a full issue: an ID'd title, its kind, and the markdown body. */
export const writeUp = (project: string, title: string, problem: string, want: string) =>
  post<{ title: string; kind: IssueKind; body: string }>('/api/issues/write', { project, title, problem, want });

/** Runs a project's app with its "run" command from projects.json, or stops it again. */
export const startApp = (project: string) => post('/api/apps/start', { project });
export const stopApp = (project: string) => post('/api/apps/stop', { project });
/** Starts Sandcastle in the project's folder with its "sandcastle" command (unless it's running already), or stops the run started from here. */
export const startSandcastle = (project: string) => post<{ sandcastle: 'started' | 'running' }>('/api/sandcastle/start', { project });
export const stopSandcastle = (project: string) => post('/api/sandcastle/stop', { project });
/** Opens the app in the normal browser on the CEO's own screen, outside wherever the office is open. */
export const showOnScreen = (project: string) => post('/api/apps/screen', { project });

export const fetchStatus = (project: string) => get<StatusSnapshot>(`/api/status?project=${encodeURIComponent(project)}`);
