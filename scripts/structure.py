#!/usr/bin/env python3
"""Guard the documented Rust domain split and public extension examples."""
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
files=list((root/'src').rglob('*.rs'))
for path in files:
    lines=path.read_text().splitlines()
    assert len(lines)<=320,(str(path.relative_to(root)),len(lines),'split domain before growing this module')
    assert lines and (lines[0].startswith('//!') or lines[0].startswith('///')),str(path.relative_to(root))+' needs a responsibility comment'
assert len((root/'src/main.rs').read_text().splitlines())<=120
for path in (root/'extensions').glob('*.wat'):assert path.name in (root/'extensions/README.md').read_text(),path.name+' needs documentation'
print(f'PASS {len(files)} Rust modules: responsibility documented; <=320 lines; main <=120; every WAT example documented')

subprocess.run(["node", "frontend/scripts/architecture.mjs"], cwd=root, check=True)
subprocess.run(["node", "frontend/scripts/localization.mjs"], cwd=root, check=True)
subprocess.run(["python3", "scripts/testing/source_inventory.py"], cwd=root, check=True)
subprocess.run(["python3", "scripts/api_catalogue.py", "--check"], cwd=root, check=True)
