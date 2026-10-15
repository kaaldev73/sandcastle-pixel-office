#!/usr/bin/env python3
"""Local Sandcastle Pixel Office. Python standard library only.

It only reads Sandcastle's logs: it never starts or stops agents. From the CEO's computer you can file
a GitHub issue (with `gh`, in that project's folder), and run and stop a project's app with the command
projects.json gives it (its "run"). A project can also have its built app served (read-only, on a port
of its own), and opened on your own screen, in your normal browser. Apps it started are stopped when
it stops."""
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
                                 "serve": item.get("serve"), "page": item.get("page"), "run": item.get("run")})
            if projects:
                return projects
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
            print(f"Ignoring projects.json: {e}", file=sys.stderr, flush=True)
    return [{"id": DEFAULT_ROOT.name, "name": DEFAULT_ROOT.name, "root": DEFAULT_ROOT, "description": None,
             "port": None, "url": None, "serve": None, "page": None, "run": None}]

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
    """A project's app, started from the CEO's computer: its process and the last of what it printed."""
    def __init__(self, project):
        self.output = deque(maxlen=60)
        # Its own process group, so stopping it stops whatever it started too (npm starting vite, say).
        self.proc = subprocess.Popen(shlex.split(project["run"]), cwd=project["root"], stdin=subprocess.DEVNULL,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace",
                                     start_new_session=True, env={**os.environ, "BROWSER": "none", "FORCE_COLOR": "0"})
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
            APPS[project["id"]] = App(project)
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

@atexit.register
def stop_apps():
    for app in list(APPS.values()):
        app.stop()

def app_address(p):
    """The port the project's app is on and where to open it: its served folder, else its "url", else its port."""
    served = serve_app(p) if isinstance(p["serve"], str) else None
    port = served or (p["port"] if isinstance(p["port"], int) else guess_port(p["root"]))
    page = str(p["page"] or "").lstrip("/")
    url = (f"http://localhost:{port}/{page}" if served else
           p["url"] if isinstance(p["url"], str) else (f"http://localhost:{port}/{page}" if port else None))
    return port, url

def project_list():
    out = []
    for p in load_projects():
        snap = snapshot(p["root"])
        counts = {}
        for a in snap["agents"]:
            counts[a["status"]] = counts.get(a["status"], 0) + 1
        served = serve_app(p) if isinstance(p["serve"], str) else None
        port, url = app_address(p)
        app = APPS.get(p["id"])
        out.append({"id": p["id"], "name": p["name"], "found": (p["root"] / ".sandcastle").is_dir(),
                    "runnable": isinstance(p["run"], str) and bool(p["run"].strip()),
                    "started": bool(app) and app.proc.poll() is None,
                    "exitCode": app.proc.poll() if app else None,
                    "output": list(app.output)[-30:] if app else [],
                    "counts": counts, "branches": len(snap["branches"]),
                    "path": str(p["root"]).replace(str(Path.home()), "~", 1),
                    "description": p["description"] if isinstance(p["description"], str) else describe(p["root"]),
                    "port": port, "portGuessed": not served and not isinstance(p["port"], int) and port is not None,
                    "served": str(p["serve"]) if served else None,
                    "unbuilt": isinstance(p["serve"], str) and not served,
                    "running": bool(port) and listening(port),
                    "url": url})
    return {"projects": out}

def file_issue(project, title, body):
    """Opens a GitHub issue on the project's repo with `gh`, for Sandcastle's Planner to pick up."""
    try:
        done = subprocess.run(["gh", "issue", "create", "--title", title, "--body-file", "-"], cwd=project["root"],
                              input=body, capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        return 500, {"error": "The GitHub CLI (gh) isn't installed."}
    except (subprocess.TimeoutExpired, OSError) as e:
        return 500, {"error": f"gh didn't finish: {e}"}
    if done.returncode != 0:
        return 500, {"error": clean((done.stderr or done.stdout).strip() or f"gh exited with code {done.returncode}")}
    url = next((w for w in done.stdout.split() if w.startswith("https://")), done.stdout.strip())
    return 200, {"url": url}

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
        if path not in ("/api/issues", "/api/apps/start", "/api/apps/stop", "/api/apps/screen"):
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
        except (ValueError, KeyError, TypeError):
            self.send_json(400, {"error": "Bad request."})
            return
        project = next((p for p in load_projects() if p["id"] == pid), None)
        if path != "/api/issues":
            if not project:
                self.send_json(400, {"error": "No such project."})
            else:
                act = {"/api/apps/start": start_app, "/api/apps/stop": stop_app, "/api/apps/screen": show_on_screen}[path]
                self.send_json(*act(project))
            return
        if not project or not title:
            self.send_json(400, {"error": "Pick a project and give the issue a title."})
            return
        self.send_json(*file_issue(project, title, body))

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
