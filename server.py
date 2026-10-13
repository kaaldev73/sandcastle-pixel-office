#!/usr/bin/env python3
"""Read-only local Sandcastle Pixel Office. Python standard library only."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json, re, time, os, sys

ROOT = Path(os.environ.get("SANDCASTLE_PROJECT", "/home/pcs/Documents/Git/chatgpt-organizer")).resolve()
LOGS = ROOT / ".sandcastle" / "logs"
PAGE = Path(__file__).with_name("index.html")
ROLES = ("planner", "implementer", "reviewer", "merger")
SECRET = re.compile(r"(?i)(sk-ant-[a-z0-9_-]+|gh[pousr]_[a-z0-9_]+|github_pat_[a-z0-9_]+|(?:api[_ -]?key|token|password|authorization)\s*[:=]\s*[^\s,]+)")

def clean(s):
    return SECRET.sub("[redacted]", s).replace("\x1b", "")[:400]

def snapshot():
    agents = []
    for role in ROLES:
        files = sorted(LOGS.glob("*" + role + ".log"), key=lambda p: p.stat().st_mtime, reverse=True) if LOGS.is_dir() else []
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
    worktrees = ROOT / ".sandcastle" / "worktrees"
    branches = [x.name for x in worktrees.iterdir() if x.is_dir()] if worktrees.exists() else []
    return {"agents":agents,"branches":branches,"time":time.time(),"project":ROOT.name}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/status":
            body = json.dumps(snapshot()).encode()
            mime = "application/json"
        elif self.path == "/":
            body = PAGE.read_bytes()
            mime = "text/html; charset=utf-8"
        else:
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
    print(f"Reading logs from {LOGS}", flush=True)
    ThreadingHTTPServer(("127.0.0.1",port),Handler).serve_forever()
