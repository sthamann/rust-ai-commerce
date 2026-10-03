"""Owned synthetic server lifetime, child checks and loopback readiness for verification."""
from pathlib import Path
import signal
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


def run(args, env):
    subprocess.run(args, cwd=ROOT, env=env, check=True)


def stop(process):
    if process.poll() is None:
        process.send_signal(signal.SIGINT)
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=10)


def serve(env, url, log):
    process = subprocess.Popen(
        [str(ROOT / "target/debug/rust-ai-commerce")],
        cwd=ROOT,
        env=env,
        stdout=log,
        stderr=log,
    )
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("Synthetic verification server stopped during startup")
            try:
                with urllib.request.urlopen(url + "/health", timeout=1):
                    return process
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("Synthetic verification server did not become ready")
    except BaseException:
        stop(process)
        raise
