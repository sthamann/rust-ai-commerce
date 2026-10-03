"""Opt-in subprocess instrumentation for synthetic verification; never loaded by production."""
import os

if os.environ.get("COVERAGE_PROCESS_START"):
    import coverage
    coverage.process_startup()
