#!/usr/bin/env python3
"""Local Sandcastle Pixel Office. Python standard library only.

It reads Sandcastle's logs to show what the agents are doing. From the CEO's computer you can file a
GitHub issue (with `gh`, in that project's folder), written up first by Claude Code reading the project
if you like; filing it starts Sandcastle there (with its "sandcastle" command in projects.json), unless
it's already running. You can also run and stop a project's app with its "run" command. A
project can also have its built app served (read-only, on a port of its own), and opened on your own
screen, in your normal browser. Apps and Sandcastle runs it started are stopped when it stops."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json, re, time, os, sys, mimetypes, socket, subprocess, threading, zlib, shlex, signal, atexit, webbrowser
from collections import deque
from functools import partial
from http.server import SimpleHTTPRequestHandler

from urllib.parse import urlsplit, parse_qs

HERE = Path(__file__).resolve().parent
DEFAULT_ROOT = Path(os.environ.get("SANDCASTLE_PROJECT", "/home/pcs/Documents/Git/chatgpt-organizer")).resolve()
PROJECTS_FILE = HERE / "projects.json"
PAGE_2D = HERE / "index.html"
DIST = HERE / "dist"
ROLES = ("planner", "implementer", "reviewer", "merger")
SECRET = re.compile(r"(?i)(sk-ant-[a-z0-9_-]+|gh[pousr]_[a-z0-9_]+|github_pat_[a-z0-9_]+|(?:api[_ -]?key|token|password|authorization)\s*[:=]\s*[^\s,]+)")

def clean(s):
    return SECRET.sub("[redacted]", s).replace("\x1b", "")[:400]

def load_projects():
    """The files in the CEO's stack: projects.json if present, else just SANDCASTLE_PROJECT."""
    if PROJECTS_FILE.is_file():
        try:
            raw = json.loads(PROJECTS_FILE.read_text())
            items = raw.get("projects", []) if isinstance(raw, dict) else raw
            projects, seen = [], set()
            for item in items:
                path = Path(os.path.expanduser(str(item["path"]))).resolve()
                pid = str(item.get("id") or path.name)
                if pid in seen:
                    continue
                seen.add(pid)
                projects.append({"id": pid, "name": str(item.get("name") or path.name), "root": path,
                                 "description": item.get("description"), "port": item.get("port"), "url": item.get("url"),
                                 "serve": item.get("serve"), "page": item.get("page"), "run": item.get("run"),
                                 "sandcastle": item.get("sandcastle")})
            if projects:
                return projects
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
            print(f"Ignoring projects.json: {e}", file=sys.stderr, flush=True)
    return [{"id": DEFAULT_ROOT.name, "name": DEFAULT_ROOT.name, "root": DEFAULT_ROOT, "description": None,
             "port": None, "url": None, "serve": None, "page": None, "run": None, "sandcastle": None}]

def find_project(pid):
    projects = load_projects()
    return next((p for p in projects if p["id"] == pid), projects[0])

def read_text(path, limit=200_000):
    try:
        return path.read_text(errors="replace")[:limit] if path.is_file() else ""
    except OSError:
        return ""

def describe(root):
    """What the app is for, in a line: from package.json, pyproject.toml, or the README's first paragraph."""
    try:
        desc = json.loads(read_text(root / "package.json") or "{}").get("description")
        if isinstance(desc, str) and desc.strip():
            return desc.strip()
    except (ValueError, AttributeError):
        pass
    m = re.search(r'(?m)^description\s*=\s*"([^"]+)"', read_text(root / "pyproject.toml"))
    if m:
        return m.group(1)
    for para in re.split(r"\n\s*\n", read_text(root / "README.md")):
        para = para.strip()
        if para and not para.startswith(("#", "!", "[", "<", "`", ">", "|", "-")):
            return re.sub(r"\s+", " ", re.sub(r"[*_`]|\[([^\]]*)\]\([^)]*\)", r"\1", para))[:240]
    return None

def guess_port(root):
    """The port the app's dev server uses, if its scripts or config say, or Vite's own default."""
    try:
        pkg = json.loads(read_text(root / "package.json") or "{}")
    except ValueError:
        pkg = {}
    scripts = " ".join(str(v) for v in (pkg.get("scripts") or {}).values()) if isinstance(pkg, dict) else ""
    m = re.search(r"(?:--port[= ]|PORT=)(\d{2,5})", scripts)
    if m:
        return int(m.group(1))
    for name in ("vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"):
        m = re.search(r"\bport\s*:\s*(\d{2,5})", read_text(root / name))
        if m:
            return int(m.group(1))
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})} if isinstance(pkg, dict) else {}
    if "vite" in deps:
        return 5173
    if "next" in deps or "react-scripts" in deps:
        return 3000
    return None

def listening(port):
    # "localhost": dev servers listen on 127.0.0.1 or ::1, and this tries both.
    try:
        with socket.create_connection(("localhost", port), timeout=0.15):
            return True
    except OSError:
        return False

class AppFiles(SimpleHTTPRequestHandler):
    """A built app's files, as they are: no folder listings, nothing cached, nothing logged."""
    def list_directory(self, path):
        self.send_error(404)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, fmt, *args):
        pass

SERVED, SERVED_LOCK = {}, threading.Lock()

def serve_app(project):
    """Serves the project's built app folder (its "serve" in projects.json) on a local port, once: its
    "port", or one worked out from its id. Always the same port, since the browser keeps an app's saved
    data (IndexedDB, localStorage) per port."""
    folder = (project["root"] / str(project["serve"])).resolve()
    if not folder.is_relative_to(project["root"]) or not folder.is_dir():
        return None
    port = project["port"] if isinstance(project["port"], int) else 41000 + zlib.crc32(project["id"].encode()) % 1000
    with SERVED_LOCK:
        if folder not in SERVED:
            try:
                httpd = ThreadingHTTPServer(("127.0.0.1", port), partial(AppFiles, directory=str(folder)))
            except OSError as e:
                print(f"Can't serve {folder} on port {port}: {e}", file=sys.stderr, flush=True)
                SERVED[folder] = None
            else:
                threading.Thread(target=httpd.serve_forever, daemon=True).start()
                SERVED[folder] = port
        return SERVED[folder]

class App:
    """A command run in a project's folder from the CEO's computer (its app's "run", or its "sandcastle"):
    its process and the last of what it printed."""
    def __init__(self, project, command, env=None):
        self.output = deque(maxlen=60)
        # Its own process group, so stopping it stops whatever it started too (npm starting vite, say).
        self.proc = subprocess.Popen(shlex.split(command), cwd=project["root"], stdin=subprocess.DEVNULL,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
                                     start_new_session=True, env={**os.environ, "BROWSER": "none", "FORCE_COLOR": "0", **(env or {})})
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        for line in self.proc.stdout:
            line = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", line).rstrip()
            if line:
                self.output.append(clean(line))

    def stop(self):
        if self.proc.poll() is None:
            try:
                os.killpg(self.proc.pid, signal.SIGTERM)
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                os.killpg(self.proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

APPS, APPS_LOCK = {}, threading.Lock()

def start_app(project):
    if not isinstance(project["run"], str) or not project["run"].strip():
        return 400, {"error": 'This project has no "run" command in projects.json.'}
    with APPS_LOCK:
        app = APPS.get(project["id"])
        if app and app.proc.poll() is None:
            return 200, {"ok": True}
        port = project["port"] if isinstance(project["port"], int) else None
        if port and listening(port):
            return 409, {"error": f"Something is already running on port {port}."}
        try:
            APPS[project["id"]] = App(project, project["run"])
        except (OSError, ValueError) as e:
            return 500, {"error": f"Couldn't run it: {e}"}
    return 200, {"ok": True}

def show_on_screen(project):
    """Opens the project's app in the CEO's normal browser, on their own screen, outside wherever the office is."""
    port, url = app_address(project)
    if not url:
        return 400, {"error": 'No address for it: give it "port" or "url" in projects.json.'}
    if port and not listening(port):
        return 409, {"error": "It isn't running."}
    if not webbrowser.open(url):
        return 500, {"error": "Couldn't find a browser to open it in."}
    return 200, {"ok": True}

def stop_app(project):
    with APPS_LOCK:
        app = APPS.get(project["id"])
    if app and app.proc.poll() is not None:
        return 200, {"ok": True}
    if not app:
        return 409, {"error": "It wasn't started from here, so it's left running."}
    app.stop()
    return 200, {"ok": True}

RUNS, RUNS_LOCK = {}, threading.Lock()

def sandcastle_elsewhere(project):
    """Whether Sandcastle looks to be running in the project's folder already, started from somewhere else:
    a process there whose command mentions sandcastle. (Linux only: elsewhere it can't tell.)"""
    for proc in Path("/proc").glob("[0-9]*"):
        try:
            if int(proc.name) == os.getpid() or Path(os.readlink(proc / "cwd")).resolve() != project["root"]:
                continue
            if b"sandcastle" in (proc / "cmdline").read_bytes().lower():
                return True
        except (OSError, ValueError):
            continue
    return False

def github_token():
    """The GitHub CLI's token, for Sandcastle to hand its Docker sandboxes (they can't reach the host's keyring),
    as GH_TOKEN: unless it's set already, or gh isn't logged in."""
    if os.environ.get("GH_TOKEN"):
        return {}
    try:
        done = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired):
        return {}
    return {"GH_TOKEN": done.stdout.strip()} if done.returncode == 0 and done.stdout.strip() else {}

def start_sandcastle(project):
    """Starts Sandcastle in the project's folder with its "sandcastle" command, so its Planner picks up the
    open issues now: unless it's running already, from here or elsewhere, when it picks them up next round."""
    command = project["sandcastle"]
    if not isinstance(command, str) or not command.strip():
        return 400, {"error": 'This project has no "sandcastle" command in projects.json.'}
    with RUNS_LOCK:
        run = RUNS.get(project["id"])
        if (run and run.proc.poll() is None) or sandcastle_elsewhere(project):
            return 200, {"sandcastle": "running"}
        try:
            RUNS[project["id"]] = App(project, command, github_token())
        except (OSError, ValueError) as e:
            return 500, {"error": f"Couldn't start Sandcastle: {e}"}
    return 200, {"sandcastle": "started"}

def stop_sandcastle(project):
    with RUNS_LOCK:
        run = RUNS.get(project["id"])
    if run and run.proc.poll() is not None:
        return 200, {"ok": True}
    if not run:
        return 409, {"error": "It wasn't started from here, so it's left running."}
    run.stop()
    return 200, {"ok": True}

@atexit.register
def stop_apps():
    for app in [*APPS.values(), *RUNS.values()]:
        app.stop()

def app_address(p):
    """The port the project's app is on and where to open it: its served folder, else its "url", else its port."""
    served = serve_app(p) if isinstance(p["serve"], str) else None
    port = served or (p["port"] if isinstance(p["port"], int) else guess_port(p["root"]))
    page = str(p["page"] or "").lstrip("/")
    url = (f"http://localhost:{port}/{page}" if served else
           p["url"] if isinstance(p["url"], str) else (f"http://localhost:{port}/{page}" if port else None))
    return port, url

def run_issue(run):
    """The issue a Sandcastle run is on, from what it printed when it planned ("  14: FEAT-008: Title → branch")."""
    for line in reversed(run.output):
        m = re.match(r"\s*(\d+): (.+?) → \S+$", line)
        if m:
            return f"#{m.group(1)} {m.group(2)}"
    return None

def project_list():
    out = []
    for p in load_projects():
        snap = snapshot(p["root"])
        counts = {}
        for a in snap["agents"]:
            counts[a["status"]] = counts.get(a["status"], 0) + 1
        served = serve_app(p) if isinstance(p["serve"], str) else None
        port, url = app_address(p)
        app, run = APPS.get(p["id"]), RUNS.get(p["id"])
        out.append({"id": p["id"], "name": p["name"], "found": (p["root"] / ".sandcastle").is_dir(),
                    "runnable": isinstance(p["run"], str) and bool(p["run"].strip()),
                    "started": bool(app) and app.proc.poll() is None,
                    "exitCode": app.proc.poll() if app else None,
                    "output": list(app.output)[-30:] if app else [],
                    "sandcastle": isinstance(p["sandcastle"], str) and bool(p["sandcastle"].strip()),
                    "sandcastleStarted": bool(run) and run.proc.poll() is None,
                    "sandcastleExitCode": run.proc.poll() if run else None,
                    "sandcastleOutput": list(run.output)[-8:] if run else [],
                    "sandcastleIssue": run_issue(run) if run else None,
                    "busy": [a["role"] for a in snap["agents"] if a["status"] == "working"],
                    "counts": counts, "branches": len(snap["branches"]),
                    "path": str(p["root"]).replace(str(Path.home()), "~", 1),
                    "description": p["description"] if isinstance(p["description"], str) else describe(p["root"]),
                    "port": port, "portGuessed": not served and not isinstance(p["port"], int) and port is not None,
                    "served": str(p["serve"]) if served else None,
                    "unbuilt": isinstance(p["serve"], str) and not served,
                    "running": bool(port) and listening(port),
                    "url": url})
    return {"projects": out}

def repo_labels(project):
    """The labels the project's GitHub repo has (none if gh can't say)."""
    try:
        done = subprocess.run(["gh", "label", "list", "--limit", "200", "--json", "name", "--jq", ".[].name"],
                              cwd=project["root"], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return set()
    return set(done.stdout.split("\n")) if done.returncode == 0 else set()

def file_issue(project, title, body, kind=None):
    """Opens a GitHub issue on the project's repo with `gh`, for Sandcastle's Planner to pick up. It's labelled
    Sandcastle, and bug or enhancement for its kind, where the repo has those labels."""
    want = ["Sandcastle", {"bug": "bug", "feature": "enhancement"}.get(kind)]
    have = repo_labels(project)
    labels = [x for l in want if l and l in have for x in ("--label", l)]
    try:
        done = subprocess.run(["gh", "issue", "create", "--title", title, "--body-file", "-", *labels], cwd=project["root"],
                              input=body, capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        return 500, {"error": "The GitHub CLI (gh) isn't installed."}
    except (subprocess.TimeoutExpired, OSError) as e:
        return 500, {"error": f"gh didn't finish: {e}"}
    if done.returncode != 0:
        return 500, {"error": clean((done.stderr or done.stdout).strip() or f"gh exited with code {done.returncode}")}
    url = next((w for w in done.stdout.split() if w.startswith("https://")), done.stdout.strip())
    if not isinstance(project["sandcastle"], str) or not project["sandcastle"].strip():
        return 200, {"url": url, "sandcastle": None}
    code, started = start_sandcastle(project)
    return 200, {"url": url, "sandcastle": started.get("sandcastle"), "sandcastleError": started.get("error")}

WRITE_UP = """You turn a short note from the CEO into a GitHub issue for Sandcastle's coding agents, who plan and build
from it. You're in the project's folder: read its README and code (Read, Grep, Glob) so the issue fits how the
app really works, names the real parts it touches and asks for nothing it already has. Don't change anything.

The CEO's note, for the project "{name}":
<title>{title}</title>
<whats_wrong>{problem}</whats_wrong>
<what_they_want>{want}</what_they_want>

Issues already on its repo (number, title), to pick the next ID from and not repeat:
{existing}

Write it in this shape, as their other issues are:

# FEAT-006 — Short name of it
## Objective
What it's for, in a few lines; what it must NOT do, if anything.
## 1. First part
## 2. Next part
... as many numbered sections as it needs, each saying what to build or fix: workflows as numbered steps,
requirements as bullets, fallbacks if something may not be reliable, what to persist and how to migrate data,
privacy and security where it touches user data or permissions, UI that matches the existing design, and
engineering notes (what to inspect first, what to reuse, what not to break).
## Tests
The automated tests to add, as bullets, then the commands that must pass (from the project's package.json or
equivalent, such as npm test and npm run build).
## Acceptance Criteria
- [ ] Checkable outcomes, one per line.
## Important
The one or two things that matter most.

Use FEAT-NNN for a feature or change and BUG-NNN for something broken, numbered one past the highest of that kind
above (001 if none). Keep it as long as the work needs and no longer; don't invent requirements the note doesn't
imply. Reply with exactly this and nothing else:
TITLE: <ID>: <title>
KIND: feature or bug
=====
<the issue body in markdown, starting with the # heading>"""

def write_up(project, title, problem, want):
    """Has Claude (Claude Code, headless, read-only in the project's folder) write the CEO's note up as a full issue."""
    try:
        listed = subprocess.run(["gh", "issue", "list", "--state", "all", "--limit", "200", "--json", "number,title",
                                 "--jq", '.[] | "#\\(.number) \\(.title)"'], cwd=project["root"],
                                capture_output=True, text=True, timeout=30)
        existing = listed.stdout.strip() if listed.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        existing = ""
    prompt = WRITE_UP.format(name=project["name"], title=title, problem=problem or "(nothing)",
                             want=want or "(nothing)", existing=existing or "(none, or gh couldn't list them)")
    try:
        done = subprocess.run(["claude", "-p", "--restricted", "--tools", "Read,Grep,Glob", "--strict-mcp-config",
                               "--no-session-persistence", "--permission-mode", "dontAsk", "--output-format", "json"],
                              cwd=project["root"], input=prompt, capture_output=True, text=True, timeout=600)
    except FileNotFoundError:
        return 500, {"error": "Claude Code (claude) isn't installed."}
    except (subprocess.TimeoutExpired, OSError) as e:
        return 500, {"error": f"Claude didn't finish: {e}"}
    try:
        reply = json.loads(done.stdout)
    except ValueError:
        reply = {"is_error": True, "result": (done.stderr or done.stdout).strip()}
    text = str(reply.get("result") or "")
    if reply.get("is_error") or done.returncode != 0:
        return 500, {"error": clean(text or f"claude exited with code {done.returncode}")}
    m = re.search(r"(?m)^TITLE:\s*(.+)\n(?:KIND:\s*(\w+)\s*\n)?=+\s*\n", text)
    if not m:
        return 500, {"error": "Claude's write-up wasn't in the expected shape. Try again."}
    kind = (m.group(2) or "").lower()
    return 200, {"title": m.group(1).strip()[:200], "kind": kind if kind in ("feature", "bug") else None,
                 "body": text[m.end():].strip()}

def snapshot(root):
    logs = root / ".sandcastle" / "logs"
    agents = []
    for role in ROLES:
        files = sorted(logs.glob("*" + role + ".log"), key=lambda p: p.stat().st_mtime, reverse=True) if logs.is_dir() else []
        file = files[0] if files else None
        lines = file.read_text(errors="replace").splitlines()[-250:] if file else []
        recent = [clean(x.strip()) for x in lines if x.strip()][-35:]
        last = file.stat().st_mtime if file else None
        failures = ("failed", "error:", "exited with code", "exception")
        finished = ("run complete", "run finished", "agent completed", "completed successfully")
        tail = "\n".join(recent[-9:]).lower()
        if not file:
            status = "waiting"
        elif any(x in tail for x in failures):
            status = "error"
        elif any(x in tail for x in finished):
            status = "done"
        elif time.time() - last < 90:
            status = "working"
        else:
            status = "idle"
        agents.append({"role":role,"status":status,"log":file.name if file else None,"updated":last,"events":recent})
    worktrees = root / ".sandcastle" / "worktrees"
    branches = [x.name for x in worktrees.iterdir() if x.is_dir()] if worktrees.exists() else []
    return {"agents":agents,"branches":branches,"time":time.time(),"project":root.name}

def static_file(base, rel):
    """A file under `base`, or None: never anything outside it."""
    base = base.resolve()
    requested = (base / rel).resolve()
    return requested if requested.is_relative_to(base) and requested.is_file() else None

class Handler(BaseHTTPRequestHandler):
    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ("/api/issues", "/api/issues/write", "/api/apps/start", "/api/apps/stop", "/api/apps/screen",
                        "/api/sandcastle/start", "/api/sandcastle/stop"):
            self.send_error(404)
            return
        # Only from this page: another site open in the browser can't send JSON here without asking
        # first (which this server never answers), and its Origin wouldn't match.
        origin = self.headers.get("Origin")
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or (
                origin and urlsplit(origin).netloc != self.headers.get("Host")):
            self.send_json(403, {"error": "Not from Pixel Office."})
            return
        try:
            data = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length", 0)), 100_000)))
            pid = str(data["project"])
            if path == "/api/issues":
                title, body = str(data["title"]).strip()[:200], str(data["body"])[:60_000]
                kind = data.get("kind") if data.get("kind") in ("feature", "bug") else None
            elif path == "/api/issues/write":
                note = [str(data.get(k) or "").strip()[:20_000] for k in ("title", "problem", "want")]
        except (ValueError, KeyError, TypeError):
            self.send_json(400, {"error": "Bad request."})
            return
        project = next((p for p in load_projects() if p["id"] == pid), None)
        if path == "/api/issues/write":
            if not project or not any(note):
                self.send_json(400, {"error": "Pick a project and say what you want first."})
            else:
                self.send_json(*write_up(project, *note))
            return
        if path != "/api/issues":
            if not project:
                self.send_json(400, {"error": "No such project."})
            else:
                act = {"/api/apps/start": start_app, "/api/apps/stop": stop_app, "/api/apps/screen": show_on_screen,
                       "/api/sandcastle/start": start_sandcastle, "/api/sandcastle/stop": stop_sandcastle}[path]
                self.send_json(*act(project))
            return
        if not project or not title:
            self.send_json(400, {"error": "Pick a project and give the issue a title."})
            return
        self.send_json(*file_issue(project, title, body, kind))

    def do_GET(self):
        url = urlsplit(self.path)
        path, query = url.path, parse_qs(url.query)
        body = file = None
        if path == "/api/status":
            project = find_project(query.get("project", [""])[0])
            snap = snapshot(project["root"])
            snap.update(id=project["id"], name=project["name"])
            body = json.dumps(snap).encode()
            mime = "application/json"
        elif path == "/api/projects":
            body = json.dumps(project_list()).encode()
            mime = "application/json"
        elif path == "/":
            # The 3D office once it's built (see client/), else the V2 dashboard.
            file = DIST / "index.html" if (DIST / "index.html").is_file() else PAGE_2D
        elif path == "/2d":
            file = PAGE_2D
        elif path.startswith("/assets/pixel-office/"):
            # Serve only local V2 artwork; never expose arbitrary project files.
            file = static_file(HERE / "assets" / "pixel-office", path.removeprefix("/assets/pixel-office/"))
        elif path.startswith("/static/"):
            file = static_file(DIST / "static", path.removeprefix("/static/"))
        if file:
            body = file.read_bytes()
            mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
            if mime.startswith("text/") or mime.endswith("javascript"):
                mime += "; charset=utf-8"
        elif body is None:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type",mime)
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Length",str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"Sandcastle Pixel Office: http://127.0.0.1:{port}", flush=True)
    for p in load_projects():
        print(f"Project {p['id']}: {p['root'] / '.sandcastle' / 'logs'}", flush=True)
    # Stopped by a signal, it still stops the apps it started on the way out.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        ThreadingHTTPServer(("127.0.0.1",port),Handler).serve_forever()
    except KeyboardInterrupt:
        pass
