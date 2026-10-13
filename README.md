# Sandcastle Pixel Office

A lightweight, pixel-art dashboard for watching local [Sandcastle](https://github.com/ai-hero-dev/sandcastle) agent activity. Pixel Office gives the **Planner**, **Implementer**, **Reviewer**, and **Merger** their own animated workstations and shows recent logs and worktrees in one browser page.

> **Read-only local monitor.** Pixel Office does not start, stop, schedule, or control agents. It displays information already written by your Sandcastle project.

## Features

- Four pixel-art agent stations with activity indicators
- Agent status: waiting, working, done, idle, or error
- Recent activity log, selectable by agent role
- Current Sandcastle worktree names
- Overview counts for active agents, finished agents, and worktrees
- Automatic refresh every **3 seconds**
- Responsive browser layout for narrow and wide screens
- Runs using **Python's standard library**, with no Python packages to install

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

The local Python server serves the dashboard at `/` and status data at `/api/status`. Every 3 seconds the page requests a fresh snapshot.

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
| `index.html` | Dashboard UI, pixel-art visuals, and client-side polling |
| `server.py` | Local HTTP server and read-only log/worktree status endpoint |
| `.gitignore` | Excludes Python cache and local environment files |

## Current limitations

- Reads **one** Sandcastle project at a time.
- Does not run or manage agents.
- Status is inferred from log files, not a direct Sandcastle process API.
- Does not include authentication or remote hosting support.
- No bundled installer, packaging, or automated setup script.

## Contributing

Issues and pull requests are welcome. Please avoid including tokens, private logs, or personal filesystem paths in bug reports.

## License

No license has been added yet. Until a license is selected, the repository does not grant general reuse or redistribution rights beyond what applicable law allows.
