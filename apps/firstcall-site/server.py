#!/usr/bin/env python3
import json
import os
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
LEADS_JSON = ROOT / "leads.json"
VAULT_LEADS = Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents/CLAUDE/CLAUDE/1 - Projects/Firstcall/Leads/leads-log.md"

VAULT_HEADER = "# Leads Log\n\nCaptured from the Firstcall site's quote-request form. Newest first.\n\n"


def _load_env():
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_env()
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")

# Test-mode flat-rate offer. Keep in sync with the pricing shown on the site.
CHECKOUT_ITEMS = {
    "build": {"name": "Firstcall Website Build", "amount_cents": 99900, "mode": "payment"},
}


def create_checkout_session(item_key: str, origin: str):
    item = CHECKOUT_ITEMS.get(item_key)
    if not item or not STRIPE_SECRET_KEY:
        return None, "checkout not configured"
    form = {
        "mode": item["mode"],
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][product_data][name]": item["name"],
        "line_items[0][price_data][unit_amount]": str(item["amount_cents"]),
        "line_items[0][quantity]": "1",
        "success_url": f"{origin}/?checkout=success",
        "cancel_url": f"{origin}/?checkout=cancelled",
    }
    body = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(
        "https://api.stripe.com/v1/checkout/sessions",
        data=body,
        headers={
            "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("url"), None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")
        return None, f"stripe error: {detail[:300]}"
    except Exception as e:
        return None, f"request failed: {e}"


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
        elif self.path == "/api/create-checkout-session":
            length = int(self.headers.get("Content-Length", 0))
            try:
                data = json.loads(self.rfile.read(length)) if length else {}
            except Exception:
                data = {}
            origin = f"http://{self.headers.get('Host', 'localhost:8500')}"
            url, error = create_checkout_session(data.get("item", "build"), origin)
            if error:
                self._send_json(503, {"error": error})
            else:
                self._send_json(200, {"url": url})
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
