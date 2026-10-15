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
  running: boolean;
  url: string | null;
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
/** Opens a GitHub issue on the project's repo, for the Planner to pick up: its address, or why not. */
export async function fileIssue(project: string, title: string, body: string): Promise<string> {
  const res = await fetch('/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, title, body }) });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.url;
}

export const fetchStatus = (project: string) => get<StatusSnapshot>(`/api/status?project=${encodeURIComponent(project)}`);
