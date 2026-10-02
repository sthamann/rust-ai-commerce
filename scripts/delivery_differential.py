#!/usr/bin/env python3
"""Compare the original PercentageTaxRuleBuilder with the live Rust port."""
import json,random,subprocess,pathlib,os,math
root=pathlib.Path(__file__).resolve().parents[1];random.seed(46714)
cases=[{'taxes':[],'total':0},{'taxes':[],'total':100}]
for n in range(1000):
 rates=random.sample([0,4,5.5,7,10,19,20,21,25],random.randint(1,6))
 prices=[random.randint(0,100000)/100 for _ in rates];total=0 if n%7==0 else sum(prices)
 cases.append({'taxes':[{'tax':0,'tax_rate':rate,'price':p} for rate,p in zip(rates,prices)],'total':total})
subprocess.run(['cargo','build','--locked','--bin','delivery'],cwd=root,check=True)
stdin=json.dumps(cases).encode();php=json.loads(subprocess.check_output(['php','reference/delivery.php'],input=stdin,cwd=root));rust=json.loads(subprocess.check_output(['target/debug/delivery'],input=stdin,cwd=root))
for i,(a,b) in enumerate(zip(php,rust)):
 assert len(a)==len(b),(i,a,b)
 for x,y in zip(a,b):
  assert x['tax_rate']==y['tax_rate'] and math.isclose(x['percentage'],y['percentage'],rel_tol=1e-12,abs_tol=1e-10),(i,x,y)
assert len(php)==len(rust)==len(cases)
report={'reference':'shopware/core 6.7.14.2','unit':'PercentageTaxRuleBuilder::buildCollectionRules','cases':len(cases),'mismatches':0,'scope':'Pre-merged unique-rate collections including empty collections and zero-total equal shares; not whole delivery pipeline.'}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
