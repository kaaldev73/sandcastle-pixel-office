# Sandcastle Pixel Office

A lightweight office for watching local [Sandcastle](https://github.com/ai-hero-dev/sandcastle) agent activity. In V3 you make your own CEO and walk round a 3D office, in first or third person: the **Planner**, **Implementer**, **Reviewer**, and **Merger** each have a cubicle where they act out their status, with their log on the wall, and the file stack in the CEO's room switches between your Sandcastle projects. The V2 pixel-art dashboard is still at `/2d`.

> **Read-only local monitor.** Pixel Office does not start, stop, schedule, or control agents. It displays information already written by your Sandcastle project.

## Features

- 3D office: create your CEO, then walk with **WASD** and look with the mouse, in first person or third (**V** switches, the mouse wheel zooms)
- Five rooms: the CEO's room and a cubicle for each agent, read left to right from the hallway
- **Project file stack** in the CEO's room: walk up to it and press **E** to switch projects
- Agents act out their status at their desks while they work. When they're done, idle or waiting, they wander off to the lounge sofas, the windows or a colleague's desk
- Press **E** by an agent, wherever it is, to talk to it: it tells you its job, its status and what it's up to, with its log underneath
- A lounge with windows onto a beach, the sea, woods and mountains
- A retro computer on the CEO's desk: sit in the CEO's chair and press **E** for Tetris, Snake, Invaders, Breakout and Pong, with high scores kept in your browser
- Agent status: waiting, working, done, idle, or error, refreshed every **3 seconds**
- V2 pixel-art dashboard at `/2d`, with recent logs, worktree names and overview counts
- Runs using **Python's standard library**, with no Python packages or Node to install

## Requirements

- Python 3
- A local Sandcastle project that writes agent log files under `.sandcastle/logs/`
- A modern web browser

Sandcastle itself is **not included** in this repository and must be configured separately.

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/kaaldev73/sandcastle-pixel-office.git
cd sandcastle-pixel-office
```

### 2. Point the dashboard at your Sandcastle project

Set `SANDCASTLE_PROJECT` to the absolute path of the project you want to watch:

```bash
export SANDCASTLE_PROJECT="/absolute/path/to/your/sandcastle-project"
```

The project should have logs at:

```text
<your-project>/
└── .sandcastle/
    ├── logs/
    │   └── ... agent .log files
    └── worktrees/
        └── ... agent worktrees
```

If you don't set `SANDCASTLE_PROJECT`, the current server script uses the author's local ChatGPT Organizer path as a default. **Most users should set the environment variable explicitly.**

To watch several projects, copy `projects.example.json` to `projects.json` and list them; each one becomes a file in the CEO's stack. `projects.json` is git-ignored, and without it Pixel Office watches just `SANDCASTLE_PROJECT`.

```json
{
  "projects": [
    { "id": "my-app", "name": "My App", "path": "~/code/my-app" }
  ]
}
```

### 3. Start Pixel Office

```bash
python3 server.py
```

Open **http://127.0.0.1:8765** in your browser.

To use a different port:

```bash
python3 server.py 9000
```

Then open **http://127.0.0.1:9000**.

### 4. Run Sandcastle separately

Run Sandcastle from its own project terminal using that project's documented startup command. The dashboard will detect matching log updates automatically; you do **not** need to launch agents from Pixel Office.

## How monitoring works

The local Python server serves the 3D office at `/`, the V2 dashboard at `/2d`, the project list at `/api/projects`, and one project's status at `/api/status?project=<id>`. Every 3 seconds the page requests a fresh snapshot.

For each agent role, the server looks for its newest matching `*.log` file in `.sandcastle/logs/`. It uses recent log content and modification times to **infer** statuses; these are not authoritative agent-process states. If no matching log exists, the role shows *waiting*. The UI also lists directory names in `.sandcastle/worktrees/`.

If your Sandcastle setup writes logs elsewhere or uses different filenames, the dashboard may show no activity even while agents are running.

## Privacy and security

- The server binds to **127.0.0.1** by default; it is intended for local use only.
- Pixel Office reads logs and worktree names; it does not modify your Sandcastle project or execute agent commands.
- The server applies best-effort redaction to some token and password patterns, but **redaction is not comprehensive**. Agent logs may still reveal private paths, prompts, code, or other sensitive information.
- Do not expose the local server to the public internet or share live logs without reviewing them.
- Do not commit secrets or copied agent logs to this repository.

## Troubleshooting

**Page doesn't open:** Check that `python3 server.py` is still running and that you used the displayed port. If the port is occupied, choose a different one.

**All agents show "waiting":** Confirm `SANDCASTLE_PROJECT` points to the correct directory and that `.sandcastle/logs/` contains filenames ending in the corresponding role name and `.log`.

**Status looks stale or wrong:** Status is heuristic: old logs become *idle*, and errors are detected from recent text patterns. Refresh the browser or inspect the underlying Sandcastle logs directly.

**No worktrees appear:** Check whether your project creates `.sandcastle/worktrees/`. Missing or empty directories are shown as no worktrees.

## Project files

| File | Purpose |
| --- | --- |
| `client/` | The 3D office's source (TypeScript, three.js, Vite) |
| `client/src/games/` | The CEO's retro computer: the arcade menu and its games |
| `client/src/vendor/agent-office/` | Parts adapted from agent-office (MIT), see `THIRD_PARTY_NOTICES.md` |
| `dist/` | The built 3D office, committed so `python3 server.py` needs no Node |
| `index.html` | V2 dashboard UI, pixel-art visuals, and client-side polling |
| `server.py` | Local HTTP server and read-only log/worktree status endpoints |
| `projects.example.json` | Example list of projects for the CEO's file stack |
| `.gitignore` | Excludes Python cache, local environment files, `projects.json` and `node_modules/` |

## Working on the 3D office

You only need Node to change the 3D office. Run `npm install`, start `python3 server.py`, then `npm run dev` for a live-reloading copy on Vite's port (it forwards `/api` to the Python server). Run `npm run build` to rebuild `dist/` before committing.

## Current limitations

- Shows **one** Sandcastle project's agents at a time (switch at the file stack).
- Does not run or manage agents.
- Status is inferred from log files, not a direct Sandcastle process API.
- Does not include authentication or remote hosting support.
- No bundled installer, packaging, or automated setup script.

## Acknowledgments

Special thanks to **[Matt Pocock](https://github.com/mattpocock)** for his work on Sandcastle and for inspiring this pixel-art view of the agent workflow.

The 3D office's characters, movement and materials are adapted from [agent-office](https://github.com/AgentSystemLabs/agent-office) by AgentSystemLabs (MIT License); see `THIRD_PARTY_NOTICES.md`.

## Contributing

Issues and pull requests are welcome. Please avoid including tokens, private logs, or personal filesystem paths in bug reports.

## License

No license has been added yet. Until a license is selected, the repository does not grant general reuse or redistribution rights beyond what applicable law allows.
