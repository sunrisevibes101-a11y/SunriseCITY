#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
LEADS_JSON = ROOT / "leads.json"
VAULT_LEADS = Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents/CLAUDE/CLAUDE/1 - Projects/Firstcall/Leads/leads-log.md"

VAULT_HEADER = "# Leads Log\n\nCaptured from the Firstcall site's quote-request form. Newest first.\n\n"


def append_lead_json(entry: dict):
    leads = json.loads(LEADS_JSON.read_text()) if LEADS_JSON.exists() else []
    leads.append(entry)
    LEADS_JSON.write_text(json.dumps(leads, indent=2))


def prepend_lead_to_vault(entry: dict):
    if not VAULT_LEADS.parent.exists():
        VAULT_LEADS.parent.mkdir(parents=True, exist_ok=True)
    block = (
        f"## {entry['received_at']} — {entry.get('name', '(no name)')}\n"
        f"- Business: {entry.get('business', '')}\n"
        f"- Phone: {entry.get('phone', '')}\n"
        f"- Location: {entry.get('location', '')}\n"
        f"- Notes: {entry.get('message') or '(none)'}\n\n"
    )
    if VAULT_LEADS.exists():
        existing = VAULT_LEADS.read_text()
        head, sep, rest = existing.partition("\n\n")
        new_content = head + sep + block + rest if existing.startswith("# Leads Log") else VAULT_HEADER + block + existing
    else:
        new_content = VAULT_HEADER + block
    VAULT_LEADS.write_text(new_content)


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/api/leads":
            length = int(self.headers.get("Content-Length", 0))
            try:
                data = json.loads(self.rfile.read(length))
            except Exception:
                self._send_json(400, {"error": "invalid json"})
                return
            entry = {**data, "received_at": datetime.now(timezone.utc).isoformat()}
            append_lead_json(entry)
            prepend_lead_to_vault(entry)
            self._send_json(200, {"ok": True})
        else:
            self._send_json(404, {"error": "not found"})

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            path = "/index.html"
        file_path = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in file_path.parents and file_path != ROOT:
            self._send_json(403, {"error": "forbidden"})
            return
        if not file_path.exists() or not file_path.is_file():
            self._send_json(404, {"error": "not found"})
            return
        ctype = "text/html"
        if file_path.suffix == ".css":
            ctype = "text/css"
        elif file_path.suffix == ".js":
            ctype = "application/javascript"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[server] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8500))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Firstcall site serving on http://127.0.0.1:{port}")
    httpd.serve_forever()
