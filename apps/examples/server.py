#!/usr/bin/env python3
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            path = "/index.html"
        elif path.endswith("/"):
            path = path + "index.html"
        file_path = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in file_path.parents and file_path != ROOT:
            self.send_response(403)
            self.end_headers()
            return
        if not file_path.exists() or not file_path.is_file():
            self.send_response(404)
            self.end_headers()
            return
        ctype = "text/html"
        if file_path.suffix == ".css":
            ctype = "text/css"
        elif file_path.suffix == ".js":
            ctype = "application/javascript"
        elif file_path.suffix == ".svg":
            ctype = "image/svg+xml"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[server] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8510))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Examples serving on http://127.0.0.1:{port}")
    httpd.serve_forever()
