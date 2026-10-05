#!/usr/bin/env python3
"""Keep the public Vendune identity, shared vector assets and executable package/deployment paths consistent."""
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
STALE = re.compile(r'Rust Commerce|Rust AI Commerce|rust-ai-commerce|rust_ai_commerce|Commerce Studio|Commerce Platform|Commerce Plattform|\bATELIER\b|\bAtelier\b')
current = [ROOT / 'README.md', ROOT / 'frontend/index.html']
current += list((ROOT / 'frontend/src').rglob('*')) + list((ROOT / 'site').rglob('*'))
for path in current:
    if path.is_file() and path.suffix in {'.md', '.ts', '.tsx', '.html', '.json', '.txt', '.svg', '.css'}:
        assert not STALE.search(path.read_text()), f'Stale current branding: {path.relative_to(ROOT)}'

assert re.search(r'^name = "vendune"$', (ROOT / 'Cargo.toml').read_text(), re.M)
lock_names = re.findall(r'^name = "([^"]+)"$', (ROOT / 'Cargo.lock').read_text(), re.M)
assert lock_names == sorted(lock_names), 'Normalize Cargo.lock with full cargo metadata after a crate rename'
for file in ('frontend/package.json', 'frontend/package-lock.json'):
    assert json.loads((ROOT / file).read_text())['name'] == 'vendune-experience'
mark = (ROOT / 'docs/brand/vendune-mark.svg').read_bytes()
for file in ('frontend/public/brand/vendune-mark.svg', 'site/favicon.svg'):
    assert (ROOT / file).read_bytes() == mark, f'Divergent mark: {file}'
for file in (ROOT / 'docs/brand').glob('*.svg'):
    svg = ElementTree.fromstring(file.read_text())
    assert svg.tag.endswith('svg') and svg.attrib.get('aria-label') == 'Vendune'
    assert not any(n.tag.endswith('script') for n in svg.iter())
    assert not re.search(r'\b(?:href|src)=["\'](?:https?:|data:|javascript:)', file.read_text())
for folder in ('src', 'scripts', 'deploy', '.github'):
    for path in (ROOT / folder).rglob('*'):
        if path.is_file() and path != Path(__file__).resolve() and path.suffix in {'.rs', '.py', '.yml', '.yaml'}:
            assert 'rust_ai_commerce::' not in path.read_text(), path
            assert 'target/debug/rust-ai-commerce' not in path.read_text(), path
            assert '/app/rust-ai-commerce' not in path.read_text(), path
assert '/brand/vendune-mark.svg' in (ROOT / 'frontend/index.html').read_text()
assert 'https://github.com/sthamann/vendune' in (ROOT / 'site/llms.txt').read_text()
assert 'vendune-postgres-1' in (ROOT / '.github/workflows/verify.yml').read_text()

# Execute the real launcher through a fake Docker boundary; stop before any database or install mutation.
with tempfile.TemporaryDirectory(prefix='vendune-launch-') as directory:
    tmp = Path(directory)
    (tmp / 'scripts').mkdir(); (tmp / 'bin').mkdir()
    (tmp / '.env').write_text('DB_PASSWORD=synthetic-only\n')
    (tmp / 'scripts/dev.sh').write_text((ROOT / 'scripts/dev.sh').read_text())
    docker = tmp / 'bin/docker'
    docker.write_text('''#!/bin/sh
if [ "$1" = "ps" ]; then
  if [ "$LEGACY_EXISTS" = "1" ]; then printf 'synthetic-container\\n'; fi
  exit 0
fi
printf '%s\\n' "$@" > "$DOCKER_ARGS"
exit 75
''')
    docker.chmod(0o700)
    for legacy, explicit, expected in [('0', '', 'vendune'), ('1', '', 'rust-ai-commerce'), ('1', 'chosen-project', 'chosen-project')]:
        env = {**os.environ, 'PATH': str(tmp / 'bin') + ':' + os.defpath,
               'LEGACY_EXISTS': legacy, 'COMPOSE_PROJECT_NAME': explicit, 'DOCKER_ARGS': str(tmp / 'args')}
        result = subprocess.run(['/bin/bash', str(tmp / 'scripts/dev.sh')], env=env, capture_output=True)
        assert result.returncode == 75, 'Launcher must stop at the fake Docker boundary'
        assert (tmp / 'args').read_text().splitlines() == ['compose', '-p', expected, 'up', '-d', '--build', '--wait', 'postgres']
print('PASS Vendune identity, shared safe SVGs, runtime paths and real launcher fresh/legacy/explicit-project compatibility')
