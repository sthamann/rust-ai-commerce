#!/usr/bin/env python3
"""Compare bounded context/tier/quantity ports with original Shopware methods."""
import pathlib,json,random,subprocess,os
root=pathlib.Path(__file__).resolve().parents[1]
r=random.Random(731); system='2fbb5fe2e29a4d70aa5854ce7ce3e20b';de='1'*32;fr='2'*32
cases=[]
for current in [system,de,fr,'bad','f'*32]:
 for available in [[],[system,de,fr],['f'*32]]:
  for parent in [None,system,fr]:
   cases.append(dict(kind='language',current=current,available=available,languages=[dict(id=de,parent_id=parent),dict(id=fr,parent_id=de)]))
cases.append(dict(kind='language',current='ABCDEF'*5+'AB',available=['ABCDEF'*5+'AB'],languages=[dict(id='abcdef'*5+'ab',parent_id=system.upper())]))
for _ in range(700):
 cases.append(dict(kind='quantity',min=r.randint(1,20),current=r.randint(-5,500),steps=r.randint(1,25)))
for _ in range(700):
 tiers=[dict(rule_id=r.choice(['business','vip']),quantity_start=start,quantity_end=(r.choice([start,start+3,None])),discount=r.choice([.1,.15,.5])) for start in r.sample(range(1,25),r.randint(0,8))]
 r.shuffle(tiers)
 cases.append(dict(kind='tier',tiers=tiers,rules=r.choice([[],['vip'],['business','vip'],['unknown','business']]),quantity=r.randint(1,80)))
payload=json.dumps(cases).encode()
php=json.loads(subprocess.check_output(['php',str(root/'reference/context.php')],input=payload));rust=json.loads(subprocess.check_output([str(root/'target/debug/context')],input=payload))
assert len(php)==len(rust)==len(cases)
errors=[dict(input=c,php=p,rust=q) for c,p,q in zip(cases,php,rust) if p!=q]
report=dict(reference='original shopware/core 6.7.14.2 (Reflection, real DBAL/collections/entities)',cases=len(cases),failures=len(errors),examples=errors[:10],scope='ContextFactory language chain; rule priority and tier quantity selection; floor quantity normalization. Excludes whole ContextFactory SQL hydration, DAL translation hydration and entire ProductCartProcessor lifecycle.')
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
raise SystemExit(bool(errors))
