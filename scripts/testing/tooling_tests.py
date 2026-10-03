#!/usr/bin/env python3
"""Verification helpers reject coverage gaps and emit literal CI environment values."""
import copy
from pathlib import Path
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coverage_report import violations


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

    def test_env_conversion_does_not_execute_shell_text(self):
        helper = Path(__file__).with_name('coverage_env.py')
        result = subprocess.run([sys.executable, str(helper)], input="RUSTFLAGS='-C instrument-coverage'\nLLVM_PROFILE_FILE='/tmp/a $(false).profraw'\n", text=True, capture_output=True, check=True)
        self.assertEqual(result.stdout, 'RUSTFLAGS=-C instrument-coverage\nLLVM_PROFILE_FILE=/tmp/a $(false).profraw\n')

    def test_env_conversion_rejects_multiline_and_invalid_assignments(self):
        helper = Path(__file__).with_name('coverage_env.py')
        for value in ["BAD-NAME='value'", "RUSTFLAGS='one\ntwo'", "RUSTFLAGS=one two"]:
            result = subprocess.run([sys.executable, str(helper)], input=value, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
