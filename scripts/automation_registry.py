#!/usr/bin/env python3
"""Rebuild the native rule catalog from pinned PHP reflection and explicitly reviewed scope bindings."""
import argparse, json, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--write',action='store_true');args=p.parse_args()
source=json.loads(subprocess.check_output(['php','reference/automation-catalog.php'],cwd=ROOT,text=True))
native=json.loads((ROOT/'reference/automation-native.json').read_text())
assert {r['type']for r in source['conditions']}==set(native),'Source/native inventory drift; review new or removed conditions'
registry=json.loads(json.dumps(source))
for row in registry['conditions']:
    binding=native[row['type']];original=row['config']
    row.update(binding)
    if original:row['config']=original
registry['completeCatalogParity']=False
for filename,value in [('automation-source.json',source),('automation-registry.json',registry)]:
    text=json.dumps(value,indent=2)+'\n';path=ROOT/'reference'/filename
    if args.write:path.write_text(text)
    else:assert path.read_text()==text,filename+' needs explicit reviewed regeneration'
print(f'PASS pinned catalog: {len(registry["conditions"])} rule classes, {sum(r["supported"] for r in registry["conditions"])} native scopes, {len(registry["actions"])} Core action names; whole behavior equivalence remains unproved')
