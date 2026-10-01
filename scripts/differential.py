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
payload=json.dumps(cases).encode()
php=json.loads(subprocess.check_output(['php',str(root/'reference/price.php')],input=payload))
rust=json.loads(subprocess.check_output([str(root/'target/debug/price')],input=payload))
failures=[]
for n,(case,p,r) in enumerate(zip(cases,php,rust)):
    for key in ['unit_price','total_price','tax','quantity']:
        if abs(p[key]-r[key])>1e-8:
            failures.append(dict(case=n,input=case,field=key,php=p[key],rust=r[key]))
report={'reference':'original shopware/core 6.7.14.2','cases':len(cases),'failures':len(failures),'examples':failures[:10],'scope':'Single tax rule, gross/net quantity, calculated flag, cash/math rounding. Excludes lists/reference/regulation prices, tax-free and multi-rule allocation.'}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'): pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
raise SystemExit(bool(failures))
