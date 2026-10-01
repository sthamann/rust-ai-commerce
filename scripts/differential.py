#!/usr/bin/env python3
"""Independent PHP/Rust differential; fails on any money delta, not averaged error."""
import json, subprocess, random, pathlib, os
root=pathlib.Path(__file__).resolve().parents[1]
random.seed(731)
cases=[]
for price in [0,0.005,0.015,1.005,1.004999,1.005001,19.995,100.125,-1.005,-19.995,999.9999]:
    for qty in [1,3,19]:
        for gross in [True,False]:
            for calculated in [True,False]:
                for interval in [0.01,0.05]:
                    cases.append(dict(price=price,quantity=qty,tax_rate=19,gross=gross,calculated=calculated,decimals=2,interval=interval,round_for_net=False))
for _ in range(1000):
    cases.append(dict(price=round(random.uniform(-1000,1000),random.choice([2,3,4])),quantity=random.randint(1,100),tax_rate=random.choice([0,7,19,20]),gross=random.choice([True,False]),calculated=random.choice([True,False]),decimals=random.choice([2,3]),interval=random.choice([.01,.05]),round_for_net=random.choice([True,False])))
for rules in [[],[dict(tax_rate=19,percentage=70),dict(tax_rate=7,percentage=30)],[dict(tax_rate=19,percentage=30),dict(tax_rate=19,percentage=70)], [dict(tax_rate=0,percentage=100)]]:
    for price in [0,1.005,19.995,-19.995,200.123]:
        for gross in [True,False]:
            for calculated in [True,False]:
                cases.append(dict(price=price,quantity=3,tax_rate=19,tax_rules=rules,gross=gross,calculated=calculated,list_price=price*1.3,regulation_price=price*.9,reference=dict(purchase_unit=.35,reference_unit=1,unit_name='l')))
for _ in range(800):
    price=round(random.uniform(-1000,1000),4)
    percentage=random.choice([0,33.33,50,70,100])
    cases.append(dict(price=price,quantity=random.randint(0,100),tax_rate=19,tax_rules=[dict(tax_rate=19,percentage=percentage),dict(tax_rate=7,percentage=100-percentage)],gross=random.choice([True,False]),calculated=random.choice([True,False]),decimals=random.choice([2,3]),interval=random.choice([.01,.05]),round_for_net=random.choice([True,False]),list_price=random.choice([0,price*1.5,-5]),regulation_price=random.choice([0,price*.8,-5]),reference=dict(purchase_unit=random.choice([0,-1,.35,2,120]),reference_unit=random.choice([0,-1,1,100]),unit_name='unit')))
payload=json.dumps(cases).encode()
php=json.loads(subprocess.check_output(['php',str(root/'reference/price.php')],input=payload))
rust=json.loads(subprocess.check_output([str(root/'target/debug/price')],input=payload))
failures=[]
def compare(p,r,path=''):
    if isinstance(p,dict):
        if not isinstance(r,dict) or set(p)!=set(r): return [(path,p,r)]
        return [failure for k in p for failure in compare(p[k],r[k],path+'.'+k)]
    if isinstance(p,list):
        if not isinstance(r,list) or len(p)!=len(r): return [(path,p,r)]
        return [failure for k in range(len(p)) for failure in compare(p[k],r[k],path+f'[{k}]')]
    if isinstance(p,(int,float)) and isinstance(r,(int,float)):
        return [] if abs(p-r)<=1e-8 else [(path,p,r)]
    return [] if p==r else [(path,p,r)]
assert len(php)==len(rust)==len(cases)
for n,(case,p,r) in enumerate(zip(cases,php,rust)):
    for key,left,right in compare(p,r):
        failures.append(dict(case=n,input=case,field=key,php=left,rust=right))
report={'reference':'original shopware/core 6.7.14.2','cases':len(cases),'failures':len(failures),'examples':failures[:10],'scope':'Gross/net quantity, empty/multiple/duplicate tax rules, calculated flag, cash/math rounding, list/regulation/reference prices. Excludes full cart processor, currency conversion and sales-channel tax-state resolution.'}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'): pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
raise SystemExit(bool(failures))
