#!/usr/bin/env python3
"""App-owned code, SQLite structures and versioned browser UI; no commerce credentials reach the guest."""
import json
import os
import pathlib
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent
TOKEN = os.environ["APP_TOKEN"]
DB = os.environ.get("APP_DB", ".run/product-lab.sqlite")
with sqlite3.connect(DB) as db:
    db.execute("CREATE TABLE IF NOT EXISTS inbox(tenant TEXT, event_key TEXT, payload TEXT, PRIMARY KEY(tenant,event_key))")
    db.execute("CREATE TABLE IF NOT EXISTS care_facts(product TEXT PRIMARY KEY, data TEXT)")
    db.execute("INSERT OR IGNORE INTO care_facts VALUES (?,?)", ("mug", json.dumps({"en":"The example mug is dishwasher-safe. Keep it away from direct heat.", "de":"Der Beispielbecher ist spülmaschinengeeignet. Direkte Hitze vermeiden.", "fr":"La tasse exemple passe au lave-vaisselle. Éviter la chaleur directe.", "es":"La taza de ejemplo es apta para lavavajillas. Evita el calor directo."})))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, status, body, kind="application/json"):
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        files = {"/v1/index.html": (ROOT / "index.html", "text/html; charset=utf-8"),
                 "/sdk.js": (ROOT.parents[1] / "sdk/browser.js", "text/javascript"),
                 "/v1/app.js": (ROOT / "app.js", "text/javascript")}
        file = files.get(self.path)
        if file:
            return self.send(200, file[0].read_bytes(), file[1])
        self.send(404, {})

    def do_POST(self):
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self.send(401, {})
        tenant = self.headers.get("x-tenant")
        length = int(self.headers.get("Content-Length", "0"))
        if not tenant or not 0 < length <= 65536:
            return self.send(400, {})
        try:
            value = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            return self.send(400, {})
        if self.path == "/actions/recommend":
            with sqlite3.connect(DB) as db:
                row = db.execute("SELECT data FROM care_facts WHERE product=?", (value["productId"],)).fetchone()
            locale = value.get("locale", "en").split("-")[0]
            facts = json.loads(row[0]) if row else {}
            fallback = {"en":"No verified care facts for this product yet.", "de":"Für dieses Produkt liegen noch keine geprüften Pflegehinweise vor.", "fr":"Aucun conseil vérifié pour ce produit.", "es":"Aún no hay consejos verificados para este producto."}
            return self.send(200, {"productId": value["productId"], "answer": facts.get(locale, facts.get("en", fallback.get(locale, fallback["en"]))), "source": "app-owned example facts", "engine": "deterministic retrieval; no LLM inference"})
        if self.path == "/events":
            with sqlite3.connect(DB) as db:
                cursor = db.execute("INSERT OR IGNORE INTO inbox VALUES(?,?,?)", (tenant, value["idempotencyKey"], json.dumps(value)))
            return self.send(200, {"received": True, "duplicate": cursor.rowcount == 0})
        self.send(404, {})


if __name__ == "__main__":
    ThreadingHTTPServer((os.getenv("APP_BIND", "127.0.0.1"), int(os.getenv("APP_PORT", "8798"))), Handler).serve_forever()
