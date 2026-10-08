#!/usr/bin/env python3
"""Every static commerce Admin API method must have an adjacent explicit permission; new routes fail closed."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
count=0
for p in (root/'src').rglob('*.rs'):
    if 'connectors' in p.parts:continue
    s=p.read_text()
    assert not re.search(r'\.route\(\s*"/api/',s), f'{p.relative_to(root)}: use secure_route with explicit rights'
    for m in re.finditer(r'\.secure_route\(\s*"(/api/[^"\n]+)"\s*,\s*&\[(.*?)\],',s,re.S):
        declared=re.findall(r'\("(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)",\s*"([a-z.]+)"\)',m[2])
        assert declared,(p,m[1],'missing rights')
        end=s.find('\n        )',m.end())
        # Balanced router expression follows the permission slice; layers can contain nested closures.
        depth=1;quoted=False;escaped=False;i=m.end()
        while i<len(s) and depth:
            c=s[i]
            if quoted:
                if escaped:escaped=False
                elif c=='\\':escaped=True
                elif c=='"':quoted=False
            elif c=='"':quoted=True
            elif c=='(':depth+=1
            elif c==')':depth-=1
            i+=1
        actual={x.upper() for x in re.findall(r'\b(get|post|put|patch|delete|head|options)\s*\(',s[m.end():i-1])}
        assert actual=={method for method,_ in declared},(p,m[1],actual,declared)
        count+=len(declared)
assert count>100, 'Permission registry unexpectedly incomplete'
print(f'PASS {count} API methods: explicit route rights, no wildcard route fallback')
