#!/usr/bin/env python3
"""Verification helpers reject coverage gaps and emit literal CI environment values."""
import json
import tempfile
import copy
from pathlib import Path
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coverage_report import read_reports, violations
from source_inventory import responsibility


class CoverageGates(unittest.TestCase):
    def setUp(self):
        self.metrics = {'frontend': {'lines': 80, 'branches': 70}}
        self.modules = {'transport.ts': {k: 100 for k in ('lines', 'branches', 'functions', 'statements')}}
        self.policy = {'minimums': {'frontend': {'lines': 80, 'branches': 70}}, 'full_modules': ['transport.ts']}

    def test_passes_exact_floor(self):
        self.assertEqual(violations(self.metrics, self.modules, self.policy), [])

    def test_rejects_each_coverage_regression(self):
        for metric in self.metrics['frontend']:
            changed = copy.deepcopy(self.metrics)
            changed['frontend'][metric] -= 1
            self.assertTrue(violations(changed, self.modules, self.policy))

    def test_rejects_missing_fully_covered_module(self):
        self.assertTrue(violations(self.metrics, {}, self.policy))

    def test_rejects_uncovered_branch_in_full_module(self):
        self.modules['transport.ts']['branches'] = 99
        self.assertTrue(violations(self.metrics, self.modules, self.policy))

    def test_full_claim_rejects_unmeasured_scopes_even_with_perfect_totals(self):
        self.metrics['frontend'] = {'lines': 100, 'branches': 100}
        errors = violations(self.metrics, self.modules, self.policy, True)
        self.assertTrue(any('Unmeasured scope' in e for e in errors))

    def test_reports_include_untouched_source_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'frontend/src/shared/api/fixture.ts'
            source.parent.mkdir(parents=True)
            source.write_text('export const fixture = 1;')
            python_source = root / 'scripts/fixture.py'
            python_source.parent.mkdir()
            python_source.write_text('fixture = 1')
            scores = {key: {'pct': 100} for key in ('lines', 'branches', 'functions', 'statements')}
            frontend = {'total': scores, str(source): scores}
            rust = {'data': [{'totals': {key: {'percent': 100} for key in ('lines', 'functions', 'regions')}, 'files': []}]}
            python = {'totals': {'covered_lines': 1, 'num_statements': 1, 'covered_branches': 1, 'num_branches': 1},
                      'files': {'scripts/fixture.py': {'summary': {'covered_lines': 1}}}}
            files = {'frontend/coverage/coverage-summary.json': frontend, 'artifacts/coverage/rust.json': rust, 'artifacts/coverage/python.json': python}
            for path, value in files.items():
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(value))
            metrics, modules, missing = read_reports(root)
            self.assertEqual(metrics['frontend']['lines'], 100)
            self.assertIn('frontend/src/shared/api/fixture.ts', modules)
            self.assertEqual(missing['frontend'], [])
            (source.parent / 'untested.ts').write_text('export const untested = 2;')
            with self.assertRaisesRegex(ValueError, 'untested.ts'):
                read_reports(root)

    def test_reports_cannot_omit_a_python_service(self):
        # The manifest check in read_reports is exercised by the synthetic report above.
        # Check its independent Python source scope with a real temporary service file.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'frontend/coverage').mkdir(parents=True)
            (root / 'artifacts/coverage').mkdir(parents=True)
            (root / 'extensions/services').mkdir(parents=True)
            (root / 'extensions/services/missing.py').write_text('value = 1')
            scores = {key: {'pct': 100} for key in ('lines', 'branches', 'functions', 'statements')}
            (root / 'frontend/coverage/coverage-summary.json').write_text(json.dumps({'total': scores}))
            (root / 'artifacts/coverage/rust.json').write_text(json.dumps({'data': [{'totals': {key: {'percent': 100} for key in ('lines', 'functions', 'regions')}, 'files': []}]}))
            (root / 'artifacts/coverage/python.json').write_text(json.dumps({'totals': {'covered_lines': 0, 'num_statements': 0, 'covered_branches': 0, 'num_branches': 0}, 'files': {}}))
            with self.assertRaisesRegex(ValueError, 'missing.py'):
                read_reports(root)

    def test_inventory_reads_the_actual_style_wasm_and_html_contracts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture'
            cases = [('/* Ordered Studio layout. */', 'Ordered Studio layout.'),
                     ('/** Scoped request transport. */', 'Scoped request transport.'),
                     (';; Quantity guard.\n(module)', 'Quantity guard.'),
                     ('<html><title>Product Lab</title></html>', 'Isolated app interface: Product Lab'),
                     ('<!doctype html>', 'Independent app entry; see extensions/README.md for its public contract.')]
            for source, expected in cases:
                path.write_text(source)
                self.assertEqual(responsibility(path), expected)

    def test_env_conversion_does_not_execute_shell_text(self):
        helper = Path(__file__).with_name('coverage_env.py')
        result = subprocess.run([sys.executable, str(helper)], input="RUSTFLAGS='-C instrument-coverage'\nLLVM_PROFILE_FILE='/tmp/a $(false).profraw'\n", text=True, capture_output=True, check=True)
        self.assertEqual(result.stdout, 'RUSTFLAGS=-C instrument-coverage\nLLVM_PROFILE_FILE=/tmp/a $(false).profraw\n')

    def test_env_conversion_rejects_multiline_and_invalid_assignments(self):
        helper = Path(__file__).with_name('coverage_env.py')
        for value in ["BAD-NAME='value'", "RUSTFLAGS='one\ntwo'", "RUSTFLAGS=one two"]:
            result = subprocess.run([sys.executable, str(helper)], input=value, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)


class PlaygroundSafety(unittest.TestCase):
    def test_setup_refuses_remote_origins_before_credentials_are_used(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from playground import Client
        for origin in ('https://example.com', 'http://127.0.0.1.evil.test', 'http://user:secret@localhost', 'http://localhost/path', 'http://localhost?token=secret'):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                Client(origin)
        self.assertEqual(Client('http://127.0.0.1:8787/').base, 'http://127.0.0.1:8787')

    def test_private_state_permissions_and_symlink_refusal(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from playground import private_write
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'state.json'
            target.write_text('old')
            target.chmod(0o644)
            private_write(target, {'workspace': 'playground-example'})
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            link = Path(directory) / 'link.json'
            link.symlink_to(target)
            with self.assertRaises(OSError):
                private_write(link, {'workspace': 'wrong'})
            self.assertEqual(json.loads(target.read_text())['workspace'], 'playground-example')


if __name__ == '__main__':
    unittest.main()
