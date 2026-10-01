#!/usr/bin/env python3
"""Named, reviewable port gates; never marks an untested unit as complete."""
import argparse,json,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
manifest=json.loads((root/'porting/units.json').read_text())
parser=argparse.ArgumentParser();parser.add_argument('command',choices=['list','context','verify']);parser.add_argument('unit',nargs='?');a=parser.parse_args()
if a.command=='list':print(json.dumps(manifest,indent=2));raise SystemExit()
unit=next((u for u in manifest['units'] if u['id']==a.unit),None)
if not unit:parser.error('Unknown unit')
if a.command=='context':print(json.dumps({'reference':manifest['reference'],'unit':unit},indent=2));raise SystemExit()
if not unit['gates']:parser.error('No verification gate exists for this planned unit')
for command in unit['gates']:subprocess.run(command,cwd=root,check=True)
print(json.dumps({'unit':unit['id'],'gate':'passed','scope':unit['status'],'remaining':unit['remaining']},indent=2))
