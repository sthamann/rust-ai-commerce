#!/usr/bin/env python3
"""Generate a drift-checked static HTTP route catalogue from the compiled Rust router declarations."""
import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
rows={}
for file in sorted((ROOT/'src').rglob('*.rs')):
 # Independently deployed app services are not core API endpoints.
 if 'connectors' in file.relative_to(ROOT).parts:continue
 text=file.read_text()
 for match in re.finditer(r'\.route\(\s*"([^"\n]+)"\s*,',text):
  start=match.end();depth=1;quoted=False;escaped=False;end=start
  while end<len(text) and depth:
   c=text[end]
   if quoted:
    if escaped:escaped=False
    elif c=='\\':escaped=True
    elif c=='"':quoted=False
   elif c=='"':quoted=True
   elif c=='(':depth+=1
   elif c==')':depth-=1
   end+=1
  expression=text[start:end-1]
  for method in re.findall(r'\b(get|post|put|patch|delete|head|options)\s*\(',expression):
   path=match.group(1)
   rows[(path,method)]={'path':path,'method':method.upper(),'source':str(file.relative_to(ROOT))}
result=json.dumps(sorted(rows.values(),key=lambda r:(r['path'],r['method'])),indent=2)+'\n'
target=ROOT/'frontend/src/admin/developer/api/routes.json'
if '--check' in sys.argv:
 if not target.exists() or target.read_text()!=result:sys.exit('API catalogue drift: run python3 scripts/api_catalogue.py')
else:
 target.parent.mkdir(parents=True,exist_ok=True);target.write_text(result)
print(f'API catalogue: {len(rows)} static route/method pairs; app routes are discovered per shop at runtime')
