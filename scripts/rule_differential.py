#!/usr/bin/env python3
"""Execute original Shopware numeric comparisons, including epsilon, null and unsupported operator semantics."""
import json,pathlib,random,subprocess
root=pathlib.Path(__file__).resolve().parents[1];r=random.Random(745);cases=[]
for item in [None,0.,1e-8,-1e-8,100.,100.+1e-9,100.+1e-8]:
 for rule in [None,0.,1e-8,-1e-8,100.]:
  for op in ['=','!=','>','>=','<','<=','empty','invalid']:cases.append({'item':item,'rule':rule,'operator':op})
for _ in range(1000):
 a=r.uniform(-10000,10000);cases.append({'item':a,'rule':a+r.choice([0,1e-10,1e-8,2e-8,-1e-8,r.uniform(-2,2)]),'operator':r.choice(['=','!=','>','>=','<','<='])})
payload=json.dumps(cases).encode();p=json.loads(subprocess.check_output(['php',str(root/'reference/rules.php')],input=payload));q=json.loads(subprocess.check_output([str(root/'target/debug/rules')],input=payload));assert p==q,[(a,b,c) for a,b,c in zip(cases,p,q) if b!=c][:5]
print('PASS',len(cases),'original Shopware RuleComparison::numeric cases; not whole Rule Builder parity')
