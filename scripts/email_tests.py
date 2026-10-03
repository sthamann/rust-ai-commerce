#!/usr/bin/env python3
"""Real SMTP/TLS and provider HTTP fixtures plus Rust/PostgreSQL/MCP/flow consumers. No external mail."""

import copy, json, os, pathlib, socket, socketserver, ssl, subprocess, sys, tempfile, threading, time, unittest, urllib.error, urllib.request, urllib.parse, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "extensions/services/connectors"))
from cryptography.fernet import Fernet
from server import Connector, Handler
import email_config, email_templates, email_delivery


def http(url, body=None, headers=None, method=None, expected=200):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            status, result = r.status, json.load(r)
    except urllib.error.HTTPError as e:
        status, result = e.code, json.load(e)
        e.close()
    assert status == expected, (req.selector, status, result)
    return result


class SMTP(socketserver.StreamRequestHandler):
    def finish(self):
        try:
            super().finish()
        finally:
            self.request.close()

    def handle(self):
        if self.server.implicit:
            self.connection = self.request = self.server.context.wrap_socket(
                self.request, server_side=True
            )
            self.rfile = self.request.makefile("rb")
            self.wfile = self.request.makefile("wb")

        def reply(text):
            self.wfile.write((text + "\r\n").encode())
            self.wfile.flush()

        reply("220 fixture SMTP")
        recipients = []
        while True:
            command = self.rfile.readline().decode().strip()
            if not command:
                return
            verb = command.split()[0].upper()
            if verb in ("EHLO", "HELO"):
                self.wfile.write(b"250-fixture\r\n250 STARTTLS\r\n")
                self.wfile.flush()
            elif verb == "STARTTLS":
                reply("220 Ready for TLS")
                self.rfile.close()
                self.wfile.close()
                self.connection = self.request = self.server.context.wrap_socket(
                    self.request, server_side=True
                )
                self.rfile = self.request.makefile("rb")
                self.wfile = self.request.makefile("wb")
            elif verb == "RCPT":
                recipients.append(command)
                reply("250 Recipient accepted")
            elif verb == "DATA":
                reply("354 Send message")
                lines = []
                while True:
                    line = self.rfile.readline()
                    if line in (b".\r\n", b""):
                        break
                    lines.append(line)
                self.server.messages.append((recipients, b"".join(lines)))
                reply("250 Message accepted")
            elif verb == "QUIT":
                reply("221 Bye")
                return
            else:
                reply("250 OK")


class Provider(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        self.server.calls.append(
            (
                self.path,
                json.loads(self.rfile.read(int(self.headers["Content-Length"]))),
                dict(self.headers),
            )
        )
        body = (
            b""
            if self.server.code == 202
            else json.dumps({"id": "fixture-message"}).encode()
        )
        self.send_response(self.server.code)
        self.send_header("X-Message-Id", "sendgrid-fixture")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Contracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cert = pathlib.Path(cls.folder.name) / "cert.pem"
        key = cert.with_name("key.pem")
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                str(key),
                "-out",
                str(cert),
                "-days",
                "1",
                "-subj",
                "/CN=localhost",
                "-addext",
                "subjectAltName=DNS:localhost,IP:127.0.0.1",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        cls.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        cls.context.load_cert_chain(cert, key)
        cls.client_context = ssl.create_default_context(cafile=str(cert))
        cls.smtp = socketserver.ThreadingTCPServer(("127.0.0.1", 0), SMTP)
        cls.smtp.daemon_threads = True
        cls.smtp.context = cls.context
        cls.smtp.implicit = False
        cls.smtp.messages = []
        cls.provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        cls.provider.calls = []
        cls.provider.code = 200
        for server in (cls.smtp, cls.provider):
            threading.Thread(target=server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        for server in (cls.smtp, cls.provider):
            server.shutdown()
            server.server_close()
        cls.folder.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(
            os.environ,
            {
                "CONNECTOR_DATABASE": self.temp.name + "/state.sqlite",
                "CONNECTOR_SECRET_KEY": Fernet.generate_key().decode(),
                "CONNECTOR_GATEWAY_TOKEN": "fixture-gateway-" + "x" * 40,
                "EMAIL_TEST_SMTP": "1",
                "CONNECTOR_TEST_ENDPOINTS": json.dumps(
                    {
                        k: "http://127.0.0.1:" + str(self.provider.server_port)
                        for k in ("resend", "sendgrid", "sendgrid_eu")
                    }
                ),
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.connector = Connector()
        self.smtp.messages.clear()
        self.provider.calls.clear()
        self.provider.code = 200
        self.smtp.implicit = False
        self.settings = {
            **copy.deepcopy(email_config.DEFAULTS),
            "enabled": True,
            "fromEmail": "shop@example.test",
            "fromName": "Test shop",
            "smtpHost": "127.0.0.1",
            "smtpPort": self.smtp.server_address[1],
            "smtpSecurity": "test_plain",
        }

    def configure(self, **changes):
        self.settings.update(changes)
        return self.connector.action(
            "one",
            "email",
            "configure",
            {
                "revision": self.connector.store.get("one", "email")["revision"],
                "settings": self.settings,
                "credentials": {"apiKey": "fixture-api-key"},
            },
        )

    def send(self, key="request-one", **changes):
        return self.connector.action(
            "one",
            "email",
            "send",
            {
                "requestKey": key,
                "message": {
                    "to": ["buyer@example.test"],
                    "bcc": ["archive@example.test"],
                    "subject": "Order ✓",
                    "text": "Thank you",
                    "html": "<p>Thank you</p>",
                },
                **changes,
            },
        )

    def test_default_disabled_secrets_revision_and_tenant(self):
        self.assertFalse(
            self.connector.action("one", "email", "status", {})["settings"]["enabled"]
        )
        with self.assertRaises(ValueError):
            self.send()
        value = self.configure()
        self.assertNotIn("fixture-api-key", json.dumps(value))
        self.assertTrue(value["credentialsConfigured"]["apiKey"])
        self.assertFalse(
            self.connector.action("two", "email", "status", {})[
                "credentialsConfigured"
            ]["apiKey"]
        )
        with self.assertRaises(ValueError):
            self.connector.action(
                "one", "email", "configure", {"revision": 0, "settings": self.settings}
            )
        self.assertNotIn(
            b"fixture-api-key",
            pathlib.Path(self.temp.name + "/state.sqlite").read_bytes(),
        )

    def test_dry_run_duplicate_and_conflicting_payload(self):
        self.configure()
        self.send()
        self.send()
        self.connector.once("email")
        self.send()
        self.connector.once("email")
        jobs = self.connector.store.jobs("one", "email")
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["result"]["outcome"], "dry_run")
        self.assertEqual(self.smtp.messages, [])
        with self.assertRaises(ValueError):
            self.send(
                message={"to": "other@example.test", "subject": "Changed", "text": "x"}
            )

    def test_real_smtp_plain_starttls_and_implicit_tls(self):
        sentinel = object()
        with patch(
            "email_delivery.socket.create_connection",
            side_effect=[OSError("No IPv6 route"), sentinel],
        ) as connect:
            self.assertIs(
                email_delivery.pinned_socket(
                    (["2001:4860:4860::8888", "8.8.8.8"], 587), 8
                ),
                sentinel,
            )
            self.assertEqual(connect.call_args.args[0], ("8.8.8.8", 587))
        for mode in ("test_plain", "starttls", "tls"):
            self.smtp.implicit = mode == "tls"
            self.configure(dryRun=False, smtpSecurity=mode)
            self.send(mode)
            with patch(
                "email_delivery.ssl.create_default_context",
                return_value=self.client_context,
            ):
                self.connector.once("email")
            self.assertEqual(
                self.connector.store.jobs("one", "email")[0]["result"]["outcome"],
                "accepted",
            )
        self.assertEqual(len(self.smtp.messages), 3)
        for recipients, raw in self.smtp.messages:
            self.assertEqual(len(recipients), 2)
            self.assertNotIn(b"Bcc:", raw)
            self.assertIn(b"multipart/alternative", raw)

    def test_real_resend_sendgrid_global_and_eu(self):
        for provider, region in (
            ("resend", "global"),
            ("sendgrid", "global"),
            ("sendgrid", "eu"),
        ):
            self.provider.code = 200 if provider == "resend" else 202
            self.configure(provider=provider, region=region, dryRun=False)
            self.send(provider + region)
            self.connector.once("email")
            job = self.connector.store.jobs("one", "email")[0]
            self.assertEqual(job["result"]["outcome"], "accepted")
        self.assertEqual(len(self.provider.calls), 3)
        path, body, headers = self.provider.calls[0]
        self.assertEqual(path, "/emails")
        self.assertEqual(body["bcc"], ["archive@example.test"])
        self.assertEqual(len(headers["Idempotency-Key"]), 64)
        self.assertEqual(self.provider.calls[1][0], "/mail/send")
        self.assertEqual(
            self.provider.calls[1][1]["personalizations"][0]["to"],
            [{"email": "buyer@example.test"}],
        )

    def test_rate_limit_retry_and_uncertain_no_automatic_resend(self):
        self.configure(provider="resend", dryRun=False)
        self.provider.code = 429
        self.send()
        self.connector.once("email")
        self.assertEqual(
            self.connector.store.jobs("one", "email")[0]["state"], "queued"
        )
        with self.connector.store.db() as db:
            db.execute("UPDATE jobs SET available=0")
        self.provider.code = 503
        self.connector.once("email")
        self.connector.once("email")
        self.assertEqual(
            self.connector.store.jobs("one", "email")[0]["state"], "uncertain"
        )
        self.assertEqual(len(self.provider.calls), 2)
        self.send()
        self.connector.once("email")
        self.assertEqual(len(self.provider.calls), 2)

    def test_revision_change_and_restart_fence(self):
        self.configure()
        self.send()
        self.configure(fromName="Changed sender")
        self.connector.once("email")
        self.assertEqual(
            self.connector.store.jobs("one", "email")[0]["state"], "failed"
        )
        self.send("restart")
        self.connector.store.claim("email")
        self.connector = Connector()
        self.assertEqual(
            self.connector.store.jobs("one", "email")[0]["state"], "uncertain"
        )

    def test_validation_ssrf_tls_secret_switch_and_header_injection(self):
        with self.assertRaises(ValueError):
            email_config.address("buyer@example.test\r\nBcc: stolen@example.test")
        with self.assertRaises(ValueError):
            email_templates.envelope(
                {"to": "buyer@example.test", "subject": "Bad\nHeader", "text": "x"},
                self.settings,
            )
        with patch.dict(
            os.environ, {"EMAIL_TEST_SMTP": "0", "EMAIL_SMTP_HOSTS": "localhost"}
        ):
            with self.assertRaises(ValueError):
                email_config.smtp_target(
                    {**self.settings, "smtpPort": 587, "smtpSecurity": "starttls"}
                )
        self.configure(provider="resend")
        v = self.connector.action(
            "one",
            "email",
            "configure",
            {"revision": 1, "settings": {**self.settings, "provider": "sendgrid"}},
        )
        self.assertFalse(v["credentialsConfigured"]["apiKey"])

    def test_all_languages_html_escape_and_order_event_queue(self):
        self.configure(notifyOrders=True)
        event = {
            "order": {
                "orderNumber": "O-42",
                "orderCustomer": {"email": "buyer@example.test", "firstName": "<Ada>"},
                "cart": {"price": {"totalPrice": 42}},
                "currencyId": "EUR",
            }
        }
        subjects = []
        for locale in email_config.LOCALES:
            preview = self.connector.action(
                "one", "email", "preview_order", {"event": event, "locale": locale}
            )
            subjects.append(preview["mail"]["subject"])
        self.assertEqual(len(set(subjects)), 4)
        self.configure(templates={"en": {"html": "<p>{firstName}</p>"}})
        preview = self.connector.action(
            "one", "email", "preview_order", {"event": event}
        )
        self.assertEqual(preview["mail"]["html"], "<p>&lt;Ada&gt;</p>")
        self.connector.handle(
            "one",
            "email",
            "events",
            {"kind": "order.placed", "idempotencyKey": "evt-42", "data": event},
        )
        self.connector.once("email")
        self.assertEqual(
            self.connector.store.jobs("one", "email")[0]["result"]["outcome"], "dry_run"
        )

    def test_rust_api_mcp_permissions_checkout_and_real_order_flow(self):
        if not os.getenv("DATABASE_URL"):
            self.skipTest("DATABASE_URL required for real Rust/PostgreSQL path")
        service = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        service.connector = self.connector
        thread = threading.Thread(target=service.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(service.server_close)
        self.addCleanup(service.shutdown)
        stop = threading.Event()
        worker = threading.Thread(
            target=self.connector.loop, args=("email", stop), daemon=True
        )
        worker.start()
        self.addCleanup(lambda: (stop.set(), worker.join(10)))
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        base = "http://127.0.0.1:" + str(port)
        # Other running workers must never consume this fixture's flow jobs.
        database = "commerce_mail_" + uuid.uuid4().hex[:12]
        container = os.getenv("DB_CONTAINER", "rust-ai-commerce-postgres-1")
        sql = lambda command: subprocess.run(
            [
                "docker",
                "exec",
                container,
                "psql",
                "-U",
                "commerce",
                "-d",
                "postgres",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                command,
            ],
            check=True,
            capture_output=True,
        )
        sql("CREATE DATABASE " + database)
        self.addCleanup(lambda: sql("DROP DATABASE " + database + " WITH (FORCE)"))
        db_url = (
            urllib.parse.urlsplit(os.environ["DATABASE_URL"])
            ._replace(path="/" + database)
            .geturl()
        )
        env = {
            **os.environ,
            "DATABASE_URL": db_url,
            "BIND_ADDR": "127.0.0.1:" + str(port),
            "APP_SERVICES": json.dumps(
                {
                    "email": {
                        "url": "http://127.0.0.1:"
                        + str(service.server_port)
                        + "/email",
                        "token": self.connector.token,
                    }
                }
            ),
            "PROCESS_ROLE": "all",
        }
        log = open(self.temp.name + "/core.log", "w")
        self.addCleanup(log.close)
        backend = subprocess.Popen(
            [str(ROOT / "target/debug/rust-ai-commerce")],
            cwd=ROOT,
            env=env,
            stdout=log,
            stderr=log,
        )
        self.addCleanup(lambda: (backend.terminate(), backend.wait(timeout=10)))

        def api(path, body=None, headers=None, method=None, expected=200):
            return http(base + path, body, headers, method, expected)

        for _ in range(100):
            try:
                api("/health")
                break
            except OSError:
                time.sleep(0.1)
        suffix = uuid.uuid4().hex[:12]
        user = api(
            "/api/auth/register",
            {
                "email": suffix + "@example.test",
                "password": "Synthetic-email-account-2026!",
                "name": "Email Owner",
                "workspaceId": "mail-" + suffix,
                "workspaceName": "Email test shop",
            },
        )
        tenant = user["workspace"]
        h = {"Authorization": "Bearer " + user["token"], "x-tenant": tenant}
        api("/api/apps", {"builtIn": "email"}, h)
        api("/api/apps/email/actions/status", {}, {"x-tenant": tenant}, expected=401)
        api(
            "/api/apps/email/actions/status",
            {},
            {**h, "x-tenant": "other-" + suffix},
            expected=403,
        )
        s = {**self.settings, "dryRun": False, "enabled": True}
        api("/api/apps/email/actions/configure", {"revision": 0, "settings": s}, h)
        tools = api("/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, h)[
            "result"
        ]["tools"]
        self.assertIn("app.email.send_order", [t["name"] for t in tools])
        mcp = api(
            "/mcp",
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "app.email.send",
                    "arguments": {
                        "requestKey": "mcp-test",
                        "dryRun": True,
                        "message": {
                            "to": "buyer@example.test",
                            "subject": "MCP test",
                            "text": "No external delivery",
                        },
                    },
                },
            },
            h,
        )["result"]
        self.assertFalse(mcp.get("isError", False), mcp)
        self.assertEqual(mcp["structuredContent"]["state"], "accepted")
        flow = {
            "name": {l: "Email order" for l in email_config.LOCALES},
            "active": True,
            "event": "order.placed",
            "condition": {"type": "alwaysValid"},
            "action": "app_action",
            "instruction": {l: "Order email" for l in email_config.LOCALES},
            "locale": "en-GB",
            "appAction": {
                "app": "email",
                "action": "send_order",
                "arguments": {"locale": "de"},
            },
        }
        api("/api/automation/flows/mail_order", {"revision": 0, "data": flow}, h, "PUT")
        ch = {"x-tenant": tenant}
        cart = api("/store-api/checkout/cart", {"session": suffix}, ch)
        ch["sw-context-token"] = cart["token"]
        cart = api(
            "/store-api/checkout/cart/line-item",
            {"items": [{"referencedId": "mug", "quantity": 1}]},
            ch,
        )
        cart = api(
            "/store-api/checkout/context",
            {
                "revision": cart["revision"],
                "checkout": {**cart["checkout"], "customerEmail": "buyer@example.test"},
            },
            ch,
            "PUT",
        )
        order = api(
            "/store-api/checkout/order",
            {},
            {**ch, "Idempotency-Key": "order-" + suffix},
        )
        for _ in range(150):
            if self.smtp.messages:
                break
            time.sleep(0.1)
        self.assertEqual(
            len(self.smtp.messages),
            1,
            {
                "flows": api("/api/automation", headers=h),
                "mail": api("/api/apps/email/actions/status", {}, h),
            },
        )
        self.assertIn(order["orderNumber"].encode(), self.smtp.messages[0][1])
        for _ in range(100):
            jobs = api("/api/apps/email/actions/status", {}, h)["jobs"]
            if jobs[0]["result"] and jobs[0]["result"].get("outcome") == "accepted":
                break
            time.sleep(0.1)
        self.assertEqual(jobs[0]["result"]["outcome"], "accepted")
        # Published read-only actions cannot be turned into a sending flow.
        flow["appAction"]["action"] = "status"
        api(
            "/api/automation/flows/rejected",
            {"revision": 0, "data": flow},
            h,
            "PUT",
            expected=400,
        )
        stage = api("/api/environments", {"name": "Mail staging"}, h)
        api("/api/apps", {"builtIn": "email"}, {**h, "x-tenant": stage["id"]})
        # No live external service writes in a staging shop.
        api(
            "/api/apps/email/actions/send",
            {
                "requestKey": "stage-send",
                "message": {
                    "to": "buyer@example.test",
                    "subject": "Blocked",
                    "text": "x",
                },
            },
            {**h, "x-tenant": stage["id"]},
            expected=400,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
