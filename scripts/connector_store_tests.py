#!/usr/bin/env python3
"""Concurrent private state, settings/import fences and encrypted mailbox persistence."""

import concurrent.futures, json, os, pathlib, sys, tempfile, unittest
from unittest.mock import patch

sys.path.insert(
    0,
    str(pathlib.Path(__file__).resolve().parents[1] / "extensions/services/connectors"),
)
from cryptography.fernet import Fernet
from store import Store
from oauth import OAuth
from callback_page import render


class Contracts(unittest.TestCase):
    def test_settings_tokens_and_cursor_are_atomic(self):
        with tempfile.TemporaryDirectory() as folder:
            s = Store(folder + "/state.sqlite", Fernet.generate_key().decode())
            s.save(
                "one",
                "gmail",
                {"revision": 0, "settings": {}, "tokens": {"access_token": "private"}},
            )

            def change(i):
                def update(v):
                    v["settings"][str(i)] = str(i)

                s.update("one", "gmail", update)

            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(change, range(40)))
            v = s.get("one", "gmail")
            self.assertEqual(len(v["settings"]), 40)
            self.assertEqual(v["tokens"]["access_token"], "private")
            row = {
                "id": "message-1",
                "kind": "support_email",
                "text": "Private synthetic complaint",
            }
            with self.assertRaises(ValueError):
                s.sources(
                    "one",
                    "gmail",
                    [row],
                    expected_settings={"stale": "settings"},
                    history="5",
                )
            self.assertEqual(s.exports("one", "gmail", 0)["sources"], [])
            s.sources(
                "one", "gmail", [row], expected_settings=v["settings"], history="5"
            )
            self.assertEqual(s.get("one", "gmail")["historyId"], "5")
            s.sources("one", "gmail", [row])
            self.assertEqual(len(s.exports("one", "gmail", 0)["sources"]), 1)
            old = s.exports("one", "gmail", 0)["cursor"]
            barrier = s.purge("one", "gmail")
            self.assertGreater(barrier, old)
            self.assertEqual(s.exports("one", "gmail", barrier)["sources"], [])
            self.assertNotIn(
                b"Private synthetic",
                pathlib.Path(folder + "/state.sqlite").read_bytes(),
            )
            self.assertEqual(s.sources("two", "gmail"), [])

    def test_mailbox_jobs_do_not_hold_the_slack_queue(self):
        with tempfile.TemporaryDirectory() as folder:
            s = Store(folder + "/state.sqlite", Fernet.generate_key().decode())
            s.enqueue("one", "gmail", "slow-mail", {"operation": "sync"})
            s.enqueue("one", "slack", "order", {"operation": "post"})
            self.assertEqual(s.claim("gmail")["id"], "slow-mail")
            self.assertEqual(s.claim("slack")["id"], "order")
            self.assertIsNone(s.claim("slack"))

    def test_authorization_and_imports_cannot_restore_an_old_connection(self):
        with tempfile.TemporaryDirectory() as folder:
            s = Store(folder + "/state.sqlite", Fernet.generate_key().decode())
            s.save(
                "one",
                "gmail",
                {"revision": 1, "settings": {}, "tokens": {"access_token": "old"}},
            )
            oauth = OAuth(s)
            pending = s.state("one", "gmail", "verifier")
            tokens = {
                "access_token": "new",
                "refresh_token": "new-refresh",
                "scope": "https://www.googleapis.com/auth/gmail.readonly",
            }

            def in_flight(*args, **kwargs):
                # The user disconnects while the provider exchanges the earlier code.
                s.update(
                    "one",
                    "gmail",
                    lambda v: (v.pop("tokens", None), v.update(revision=2)),
                )
                s.purge("one", "gmail")
                return tokens

            with (
                patch.dict(
                    os.environ,
                    {
                        "GOOGLE_CLIENT_ID": "fixture",
                        "GOOGLE_CLIENT_SECRET": "fixture",
                        "CONNECTOR_PUBLIC_URL": "http://127.0.0.1:8797",
                    },
                ),
                patch("oauth.request", side_effect=in_flight),
            ):
                with self.assertRaises(ValueError):
                    oauth.callback_result(pending, "synthetic-code")
            self.assertNotIn("tokens", s.get("one", "gmail"))
            s.update("one", "gmail", lambda v: v.update(tokens=tokens))
            with self.assertRaises(ValueError):
                s.sources(
                    "one",
                    "gmail",
                    [{"id": "old-account-mail"}],
                    expected_settings={},
                    expected_revision=1,
                )
            self.assertEqual(s.sources("one", "gmail"), [])

    def test_unicode_exports_have_bounded_cursor_pages_and_localized_callback(self):
        with tempfile.TemporaryDirectory() as folder:
            s = Store(folder + "/state.sqlite", Fernet.generate_key().decode())
            records = [{"id": str(i), "text": "ä" * 5000} for i in range(10)]
            s.sources("one", "gmail", records)
            first = s.exports("one", "gmail", 0)
            self.assertLessEqual(len(json.dumps(first).encode()), 60000)
            collected = list(first["sources"])
            cursor = first["cursor"]
            while len(collected) < 10:
                page = s.exports("one", "gmail", cursor)
                self.assertLessEqual(len(json.dumps(page).encode()), 60000)
                self.assertGreater(page["cursor"], cursor)
                collected.extend(page["sources"])
                cursor = page["cursor"]
            self.assertEqual({r["id"] for r in collected}, {str(i) for i in range(10)})
        for language in ["en", "de", "fr", "es"]:
            self.assertIn(
                ('lang="' + language + '"').encode(), render(language + "-XX", True)
            )
            self.assertNotEqual(render(language, True), render(language, False))


if __name__ == "__main__":
    unittest.main()
