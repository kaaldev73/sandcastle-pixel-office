#!/usr/bin/env python3
"""Local Sandcastle Pixel Office. Python standard library only.

It only reads Sandcastle's logs: it never starts or stops agents. The one thing it writes is a GitHub
issue, when you file one from the CEO's computer (with `gh`, in that project's folder)."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json, re, time, os, sys, mimetypes, socket, subprocess

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
                                 "description": item.get("description"), "port": item.get("port"), "url": item.get("url")})
            if projects:
                return projects
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
            print(f"Ignoring projects.json: {e}", file=sys.stderr, flush=True)
    return [{"id": DEFAULT_ROOT.name, "name": DEFAULT_ROOT.name, "root": DEFAULT_ROOT}]

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
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.15):
            return True
    except OSError:
        return False

def project_list():
    out = []
    for p in load_projects():
        snap = snapshot(p["root"])
        counts = {}
        for a in snap["agents"]:
            counts[a["status"]] = counts.get(a["status"], 0) + 1
        port = p["port"] if isinstance(p["port"], int) else guess_port(p["root"])
        out.append({"id": p["id"], "name": p["name"], "found": (p["root"] / ".sandcastle").is_dir(),
                    "counts": counts, "branches": len(snap["branches"]),
                    "path": str(p["root"]).replace(str(Path.home()), "~", 1),
                    "description": p["description"] if isinstance(p["description"], str) else describe(p["root"]),
                    "port": port, "portGuessed": not isinstance(p["port"], int) and port is not None,
                    "running": bool(port) and listening(port),
                    "url": p["url"] if isinstance(p["url"], str) else (f"http://localhost:{port}" if port else None)})
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
        if urlsplit(self.path).path != "/api/issues":
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
            title, body = str(data["title"]).strip()[:200], str(data["body"])[:60_000]
            pid = str(data["project"])
        except (ValueError, KeyError, TypeError):
            self.send_json(400, {"error": "Bad request."})
            return
        project = next((p for p in load_projects() if p["id"] == pid), None)
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
    ThreadingHTTPServer(("127.0.0.1",port),Handler).serve_forever()
