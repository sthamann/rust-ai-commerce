"""Check real Rust include! inputs against the production image's explicit build COPY set."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]


def missing_inputs(dockerfile):
    copying = False
    inputs = []
    for line in dockerfile.splitlines():
        if line.startswith('FROM '):
            copying = line.split()[-1] == 'rust'
        elif copying and line.startswith('COPY '):
            inputs.extend(ROOT / value for value in line.split()[1:-1])
    missing = []
    for source in (ROOT / 'src').rglob('*.rs'):
        for value in re.findall(r'include_(?:str|bytes)!\s*\(\s*"([^"\n]+)"', source.read_text()):
            target = (source.parent / value).resolve()
            if not target.is_file() or not any(target == p.resolve() or (p.is_dir() and target.is_relative_to(p.resolve())) for p in inputs):
                missing.append(str(target.relative_to(ROOT)))
    return sorted(set(missing))


def main():
    dockerfile = (ROOT / 'deploy/Dockerfile').read_text()
    missing = missing_inputs(dockerfile)
    if missing:
        raise SystemExit('Production Rust image is missing compile-time inputs:\n' + '\n'.join(missing))
    # Reproduce the public build failure: source-checkout tests alone could not find it.
    broken = dockerfile.replace('COPY reference/app-manifests/ reference/app-manifests/\n', '')
    lost = missing_inputs(broken)
    assert lost and all(p.startswith('reference/app-manifests/') for p in lost), lost
    print(f'PASS production Rust image inputs; missing historical app manifests rejected ({len(lost)} files)')


if __name__ == '__main__':
    main()
