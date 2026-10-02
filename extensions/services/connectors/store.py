"""Private, tenant-bound encrypted connector state and durable delivery receipts."""

import hashlib, json, os, pathlib, secrets, sqlite3, time
from contextlib import contextmanager
from cryptography.fernet import Fernet


class Store:
    def __init__(self, path, key):
        self.path = pathlib.Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.cipher = Fernet(key.encode())
        with self.db() as db:
            db.executescript("""
          CREATE TABLE IF NOT EXISTS config(tenant TEXT,app TEXT,data TEXT,PRIMARY KEY(tenant,app));
          CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,tenant TEXT,app TEXT,expires REAL,verifier TEXT);
          CREATE TABLE IF NOT EXISTS changes(seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT,app TEXT,data TEXT);
          CREATE TABLE IF NOT EXISTS jobs(tenant TEXT,app TEXT,id TEXT,state TEXT,payload TEXT,result TEXT,available REAL,attempts INTEGER DEFAULT 0,PRIMARY KEY(tenant,app,id));
        """)
        self.path.chmod(0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def seal(self, t, a, value):
        return self.cipher.encrypt(
            json.dumps({"tenant": t, "app": a, "value": value}).encode()
        ).decode()

    def open(self, t, a, raw):
        value = json.loads(self.cipher.decrypt(raw.encode()))
        if value["tenant"] != t or value["app"] != a:
            raise ValueError("Credential tenant binding mismatch")
        return value["value"]

    def get(self, t, a):
        with self.db() as db:
            r = db.execute(
                "SELECT data FROM config WHERE tenant=? AND app=?", (t, a)
            ).fetchone()
        return self.open(t, a, r["data"]) if r else {"revision": 0, "settings": {}}

    def save(self, t, a, value):
        with self.db() as db:
            db.execute(
                "INSERT INTO config VALUES(?,?,?) ON CONFLICT(tenant,app) DO UPDATE SET data=excluded.data",
                (t, a, self.seal(t, a, value)),
            )

    def update(self, t, a, change):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            r = db.execute(
                "SELECT data FROM config WHERE tenant=? AND app=?", (t, a)
            ).fetchone()
            v = self.open(t, a, r["data"]) if r else {"revision": 0, "settings": {}}
            change(v)
            db.execute(
                "INSERT INTO config VALUES(?,?,?) ON CONFLICT(tenant,app) DO UPDATE SET data=excluded.data",
                (t, a, self.seal(t, a, v)),
            )
        return v

    def configure(self, t, a, settings, revision):
        def change(v):
            if v["revision"] != revision:
                raise ValueError("Connector settings revision changed")
            if v["settings"].get("labelId") != settings.get("labelId"):
                v.pop("historyId", None)
            v["settings"] = settings
            v["revision"] += 1

        return self.update(t, a, change)

    def state(self, t, a, verifier):
        state = secrets.token_urlsafe(32)
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute(
                "SELECT data FROM config WHERE tenant=? AND app=?", (t, a)
            ).fetchone()
            revision = self.open(t, a, row["data"])["revision"] if row else 0
            db.execute(
                "INSERT INTO oauth VALUES(?,?,?,?,?)",
                (
                    hashlib.sha256(state.encode()).hexdigest(),
                    t,
                    a,
                    time.time() + 600,
                    self.seal(t, a, {"verifier": verifier, "revision": revision}),
                ),
            )
        return state

    def consume(self, state):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            r = db.execute(
                "DELETE FROM oauth WHERE state=? RETURNING *",
                (hashlib.sha256(state.encode()).hexdigest(),),
            ).fetchone()
        if not r or r["expires"] < time.time():
            raise ValueError("OAuth state invalid or expired")
        return r["tenant"], r["app"], self.open(r["tenant"], r["app"], r["verifier"])

    def enqueue(self, t, a, key, payload):
        if not key or len(key) > 200:
            raise ValueError("Delivery key required")
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode()
        ).hexdigest()
        payload = {**payload, "fingerprint": digest}
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT payload FROM jobs WHERE tenant=? AND app=? AND id=?",
                (t, a, key),
            ).fetchone()
            if old and self.open(t, a, old["payload"])["fingerprint"] != digest:
                raise ValueError("Delivery key reused with different input")
            db.execute(
                "INSERT OR IGNORE INTO jobs VALUES(?,?,?,'queued',?,NULL,?,0)",
                (t, a, key, self.seal(t, a, payload), time.time()),
            )
        return {"jobId": key, "state": "accepted"}

    def claim(self, app=None):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            r = db.execute(
                "UPDATE jobs SET state='running',attempts=attempts+1 WHERE rowid=(SELECT rowid FROM jobs WHERE state='queued' AND available<=? AND (? IS NULL OR app=?) ORDER BY available LIMIT 1) RETURNING *",
                (time.time(), app, app),
            ).fetchone()
        return dict(r) if r else None

    def finish(self, r, state, result, delay=0):
        with self.db() as db:
            db.execute(
                "UPDATE jobs SET state=?,result=?,available=? WHERE tenant=? AND app=? AND id=?",
                (
                    state,
                    self.seal(r["tenant"], r["app"], result),
                    time.time() + delay,
                    r["tenant"],
                    r["app"],
                    r["id"],
                ),
            )

    def jobs(self, t, a):
        with self.db() as db:
            rows = db.execute(
                "SELECT id,state,result,attempts FROM jobs WHERE tenant=? AND app=? ORDER BY available DESC LIMIT 30",
                (t, a),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "state": r["state"],
                "attempts": r["attempts"],
                "result": self.open(t, a, r["result"]) if r["result"] else None,
            }
            for r in rows
        ]

    def recover(self):
        with self.db() as db:
            db.execute("UPDATE jobs SET state='uncertain' WHERE state='running'")

    def sources(
        self,
        t,
        a,
        records=None,
        expected_settings=None,
        history=None,
        expected_revision=None,
    ):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute(
                "SELECT data FROM config WHERE tenant=? AND app=?", (t, a)
            ).fetchone()
            state = (
                self.open(t, a, current["data"])
                if current
                else {"revision": 0, "settings": {}}
            )
            if expected_settings is not None and (
                state["settings"] != expected_settings
                or not state.get("tokens")
                or expected_revision is not None
                and state["revision"] != expected_revision
            ):
                raise ValueError("Connection or settings changed during import")
            db.execute(
                "CREATE TABLE IF NOT EXISTS sources(tenant TEXT,app TEXT,id TEXT,data TEXT,updated REAL,PRIMARY KEY(tenant,app,id))"
            )
            for r in records or []:
                old = db.execute(
                    "SELECT data FROM sources WHERE tenant=? AND app=? AND id=?",
                    (t, a, r["id"]),
                ).fetchone()
                if old and self.open(t, a, old["data"]) == r:
                    continue
                sealed = self.seal(t, a, r)
                db.execute(
                    "INSERT INTO sources VALUES(?,?,?,?,?) ON CONFLICT(tenant,app,id) DO UPDATE SET data=excluded.data,updated=excluded.updated",
                    (t, a, r["id"], sealed, time.time()),
                )
                db.execute(
                    "INSERT INTO changes(tenant,app,data) VALUES(?,?,?)", (t, a, sealed)
                )
            if history is not None:
                state["historyId"] = history
                db.execute(
                    "UPDATE config SET data=? WHERE tenant=? AND app=?",
                    (self.seal(t, a, state), t, a),
                )
            rows = db.execute(
                "SELECT data FROM sources WHERE tenant=? AND app=? ORDER BY updated DESC",
                (t, a),
            ).fetchall()
        return [self.open(t, a, r["data"]) for r in rows]

    def purge(self, t, a):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "CREATE TABLE IF NOT EXISTS sources(tenant TEXT,app TEXT,id TEXT,data TEXT,updated REAL,PRIMARY KEY(tenant,app,id))"
            )
            db.execute("DELETE FROM sources WHERE tenant=? AND app=?", (t, a))
            db.execute("DELETE FROM changes WHERE tenant=? AND app=?", (t, a))
            db.execute("DELETE FROM jobs WHERE tenant=? AND app=?", (t, a))
            db.execute("DELETE FROM oauth WHERE tenant=? AND app=?", (t, a))
            cursor = db.execute(
                "INSERT INTO changes(tenant,app,data) VALUES(?,?,?) RETURNING seq",
                (t, a, self.seal(t, a, {"id": "reset", "deleted": True})),
            ).fetchone()["seq"]
        return cursor

    def configs(self):
        with self.db() as db:
            rows = db.execute("SELECT tenant,app,data FROM config").fetchall()
        return [
            (r["tenant"], r["app"], self.open(r["tenant"], r["app"], r["data"]))
            for r in rows
        ]

    def exports(self, t, a, cursor):
        with self.db() as db:
            rows = db.execute(
                "SELECT seq,data FROM changes WHERE tenant=? AND app=? AND seq>? ORDER BY seq LIMIT 10",
                (t, a, cursor),
            ).fetchall()
        result = {"cursor": cursor, "sources": []}
        for r in rows:
            candidate = {
                "cursor": r["seq"],
                "sources": result["sources"] + [self.open(t, a, r["data"])],
            }
            if len(json.dumps(candidate).encode()) > 60000:
                if not result["sources"]:
                    raise ValueError("Single source exceeds export limit")
                break
            result = candidate
        return result
