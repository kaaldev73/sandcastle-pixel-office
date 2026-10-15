#!/usr/bin/env python3
"""Read-only local Sandcastle Pixel Office. Python standard library only."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json, re, time, os, sys, mimetypes

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
                projects.append({"id": pid, "name": str(item.get("name") or path.name), "root": path})
            if projects:
                return projects
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
            print(f"Ignoring projects.json: {e}", file=sys.stderr, flush=True)
    return [{"id": DEFAULT_ROOT.name, "name": DEFAULT_ROOT.name, "root": DEFAULT_ROOT}]

def find_project(pid):
    projects = load_projects()
    return next((p for p in projects if p["id"] == pid), projects[0])

def project_list():
    out = []
    for p in load_projects():
        snap = snapshot(p["root"])
        counts = {}
        for a in snap["agents"]:
            counts[a["status"]] = counts.get(a["status"], 0) + 1
        out.append({"id": p["id"], "name": p["name"], "found": (p["root"] / ".sandcastle").is_dir(),
                    "counts": counts, "branches": len(snap["branches"])})
    return {"projects": out}

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
