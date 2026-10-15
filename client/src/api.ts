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
export const fetchStatus = (project: string) => get<StatusSnapshot>(`/api/status?project=${encodeURIComponent(project)}`);
