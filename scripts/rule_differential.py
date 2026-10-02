#!/usr/bin/env python3
"""Execute original Shopware numeric comparisons, including epsilon, null and unsupported operator semantics."""
import json,pathlib,random,subprocess
root=pathlib.Path(__file__).resolve().parents[1];r=random.Random(745);cases=[]
for item in [None,0.,1e-8,-1e-8,100.,100.+1e-9,100.+1e-8]:
 for rule in [None,0.,1e-8,-1e-8,100.]:
  for op in ['=','!=','>','>=','<','<=','empty','invalid']:cases.append({'item':item,'rule':rule,'operator':op})
for _ in range(1000):
 a=r.uniform(-10000,10000);cases.append({'item':a,'rule':a+r.choice([0,1e-10,1e-8,2e-8,-1e-8,r.uniform(-2,2)]),'operator':r.choice(['=','!=','>','>=','<','<='])})
for kind in ['string','stringArray']:
 for item in [None,'',' ','\t\n','ABC','AbC','äÖΣ','İ','x\u00a0','a*b','test@example.test']:
  for rule in (['','abc','ABC','äÖΣ','test@example.test']if kind=='string'else[[],['abc'],['ABC'],['äöσ'],['i̇']]):
   for op in ['=','!=','empty','invalid']:cases.append({'kind':kind,'item':item,'rule':rule,'operator':op})
for item in [None,[],[None],[''],['a'],['a','b'],['01'],['1']]:
 for rule in [None,[],[None],[''],['a'],['b'],['01'],['1']]:
  for op in ['=','!=','empty','invalid']:cases.append({'kind':'uuids','item':item,'rule':rule,'operator':op})
payload=json.dumps(cases).encode();p=json.loads(subprocess.check_output(['php',str(root/'reference/rules.php')],input=payload));q=json.loads(subprocess.check_output([str(root/'target/debug/rules')],input=payload));assert p==q,[(a,b,c) for a,b,c in zip(cases,p,q) if b!=c][:5]
print('PASS',len(cases),'original Shopware numeric/string/stringArray/UUID comparisons; not whole condition-catalog parity')
