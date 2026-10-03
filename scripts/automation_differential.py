#!/usr/bin/env python3
"""Compare actual original Shopware rule classes with native scopes using independent synthetic entities."""
import copy,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
base={'currentTime':'2026-10-03T12:00:00Z','currency':'EUR','language':'en-GB','salesChannel':'default','price':{'totalPrice':100.,'positionPrice':100.,'netPrice':84.,'taxStatus':'gross'},'shippingCosts':{'totalPrice':0.},'checkout':{'paymentMethodId':'demo-card','shippingMethodId':'pickup'},'goodsCount':1,'lineCount':1,'goodsPrice':100.,'weight':2.,'volume':0.000001,'hasDeliveryFreeItem':True,'adminSource':False,'billing':{'country':'DE','city':'Berlin','street':'Main Street','zipcode':'10115','countryStateId':'BE'},'shipping':{'country':'DE','city':'Berlin','street':'Main Street','zipcode':'10115','countryStateId':'BE'},'customer':{'loggedIn':True,'email':'Alex@example.test','group':'consumer','active':True,'guest':False,'isCompany':False,'newsletter':False,'createdByAdmin':False,'differentAddresses':False,'salutationId':'mr','lastName':'Example','customerNumber':'C-123','affiliateCode':'partner','campaignCode':'spring','orderCount':3,'orderTotalAmount':300.,'reviewCount':2},'lines':[{'referencedId':'mug','parentId':None,'good':True,'type':'product','quantity':2,'stock':10,'availableStock':10,'totalPrice':100.,'unitPrice':50.,'weight':1.,'height':10.,'width':10.,'length':5.,'volume':0.0000005,'shippingFree':True,'closeout':False,'isNew':False,'categoryIds':['home'],'streamIds':['living'],'manufacturerId':'maker','propertyIds':['ceramic'],'propertyAndOptionIds':['ceramic','blue'],'optionIds':['blue'],'taxId':'standard','promoted':False}]}
registry=json.loads((ROOT/'reference/automation-registry.json').read_text())
cases=[]
exclude={'cartVolume','cartLineItemStock','cartLineItemListPrice','cartLineItemListPriceRatio','cartLineItemProductStates','cartLineItemProductType','customerAge','customerDaysSinceFirstLogin','customerDaysSinceLastLogin','customerDaysSinceLastOrder','customerRequestedGroup','customerTag','cartLineItemCreationDate','cartLineItemReleaseDate','customerBirthday'}
for row in registry['conditions']:
 spec=row.get('native');name=row['type']
 if not spec or name in exclude or spec['path'].startswith('order.') or name.startswith('promotion'):continue
 actual=base['lines'][0] if spec['path'].startswith('line.') else base
 try:
  for key in spec['path'].removeprefix('line.').split('.'):actual=actual[key]
 except KeyError:continue
 value=[actual] if spec['kind']in ['set','string_array','string_array_lower','zip'] and not isinstance(actual,list) else actual
 if spec['kind']=='membership':continue
 ops=(row['config'] or {}).get('operatorSet') or {}; operators=ops.get('operators') or ['=']
 for op in operators:
  if op=='empty':config={'operator':op}
  else:config={spec['field']:value,**({'operator':op}if spec['kind']!='bool'else{})}
  cases.append({'name':name,'config':config,'facts':copy.deepcopy(base)})
for name in ['andContainer','orContainer','xorContainer','notContainer']:
 for size in ([1] if name=='notContainer'else[0,1,2]):cases.append({'name':name,'config':{'children':[{'type':'alwaysValid','config':{}}]*size},'facts':copy.deepcopy(base)})
for hour in [0,2,4,12,22,23]:
 for start,end in [('22:00','04:00'),('04:00','22:00'),('12:00','12:00')]:
  facts=copy.deepcopy(base);facts['currentTime']=f'2026-10-03T{hour:02}:00:00Z';cases.append({'name':'timeRange','config':{'fromTime':start,'toTime':end,'timezone':'UTC'},'facts':facts})
for day in [2,3,4]:
 for use in [True,False]:cases.append({'name':'dateRange','config':{'fromDate':'2026-10-03T00:00:00','toDate':'2026-10-03T12:00:00','useTime':use,'timezone':'UTC'},'facts':{**copy.deepcopy(base),'currentTime':f'2026-10-{day:02}T12:00:00Z'}})
for weekday in range(1,8):cases.append({'name':'dayOfWeek','config':{'dayOfWeek':weekday,'operator':'='},'facts':copy.deepcopy(base)})
# Missing customer behavior and negative operators execute actual original classes.
for row in registry['conditions']:
 spec=row.get('native')
 if not spec or not spec.get('withoutCustomer') or row['type'] in exclude:continue
 examples=[c for c in cases if c['name']==row['type']]
 for c in examples:
  c=copy.deepcopy(c);c['facts']['customer']['loggedIn']=False;cases.append(c)
for name in ['customerCustomField','cartLineItemCustomField']:
 for kind,actual,expected in [('int',4,4),('int',4,5),('text','blue','blue'),('text','blue','red'),('float',1.5,1.5),('float',1.5,2),('bool',True,True),('bool',False,'false'),('select',['a','b'],['b']),('select',['a'],['c'])]:
  for op in ['=','!=']:
   f=copy.deepcopy(base);f['customer']['customFields']={'sample':actual};f['lines'][0]['customFields']={'sample':actual}
   cases.append({'name':name,'config':{'operator':op,'renderedField':{'name':'sample','type':kind,'config':{'componentName':'sw-multi-select'}},'renderedFieldValue':expected},'facts':f})
 for kind in ['int','bool']:
  for op in ['=','!=']:
   f=copy.deepcopy(base);f['customer']['customFields']={};f['lines'][0]['customFields']={}
   cases.append({'name':name,'config':{'operator':op,'renderedField':{'name':'absent','type':kind},'renderedFieldValue':False if kind=='bool' else 4},'facts':f})
for name in ['cartLineItemPurchasePrice','cartTotalPurchasePrice']:
 for prices in [None,{'gross':12,'net':10},{'gross':12}]:
  for mode in ['gross','net']:
   for op in ['=','!=','>','<','>=','<=']:
    f=copy.deepcopy(base);f['lines'][0]['purchasePrices']=prices
    cases.append({'name':name,'config':{'type':mode,'amount':12,'operator':op},'facts':f})
for name in ['cartGoodsCount','cartGoodsPrice','cartLineItemGoodsTotal']:
 for tag in ['home','missing']:
  f=copy.deepcopy(base)
  cases.append({'name':name,'config':{'operator':'=','amount' if name=='cartGoodsPrice' else 'count':100 if name=='cartGoodsPrice' else 2 if name=='cartLineItemGoodsTotal' else 1,'filter':{'type':'andContainer','config':{'children':[{'type':'cartLineItemInCategory','config':{'operator':'=','categoryIds':[tag]}}]}}},'facts':f})
payload=json.dumps(cases).encode();expected=json.loads(subprocess.check_output(['php',str(ROOT/'reference/automation-rules.php')],input=payload));actual=json.loads(subprocess.check_output([str(ROOT/'target/debug/automation_rules')],input=payload))
errors=[(c['name'],c['config'],e,a)for c,e,a in zip(cases,expected,actual)if e!=a]
if errors:print(json.dumps(errors[:30],indent=2));raise SystemExit(f'{len(errors)}/{len(cases)} original rule mismatches')
print(f'PASS {len(cases)} original condition-class cases across {len(set(c["name"]for c in cases))} scopes; broader catalogue parity remains separately documented')
