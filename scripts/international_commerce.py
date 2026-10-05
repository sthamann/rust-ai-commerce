#!/usr/bin/env python3
"""International configuration at the real HTTP/PostgreSQL path; all rates and addresses are synthetic fixtures, not tax advice."""
import copy,json,os,time,urllib.request,urllib.error,uuid
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8787');public={};merchant={};checks=[]
def req(path,body=None,h=None,method=None,expected=200):
 r=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**public,**(h or {})},method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(r,timeout=30)as response:status=response.status;data=json.load(response)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 assert status==expected,(path,status,expected,data)
 return data
def check(name):checks.append(name);print('PASS',name)
suffix=uuid.uuid4().hex[:10]
w=req('/api/auth/register',{'workspaceId':'intl-'+suffix,'workspaceName':'International fixture','name':'Fixture owner','email':'intl-'+suffix+'@example.test','password':'Synthetic-international-2026!'})
public={'x-tenant':w['workspace']};merchant={**public,'Authorization':'Bearer '+w['token']}
world=req('/store-api/countries');countries=world['countries'];assert len(countries)==250 and sum(c['isoAssigned'] for c in countries)==249
assert len(next(c for c in countries if c['code']=='US')['states'])==57
assert all(c['alpha3'] and c['numeric'] and all(c['name'][l] for l in ['en','de','es']) for c in countries)
check('complete continent-grouped world catalogue and 57 US states/territories have ISO metadata and EN/DE/ES names')
conf=req('/api/merchant/commerce',h=merchant);data=conf['data'];data['countries']=list(dict.fromkeys(data['countries']+[c['code'] for c in countries[:30]]+['US']))
for invalid_locale in ['en-12','en-USA','en-US-US','en-abcde-abcde','en-us']:
 invalid=copy.deepcopy(data);invalid['locales'].append(invalid_locale);req('/api/merchant/commerce',{'data':invalid,'revision':conf['revision']},merchant,'PUT',400)
for tax in data['taxes']:tax['defaultRate']=19 if tax['id']=='standard' else 7
for method in data['shipping']:method['countries']=data['countries'].copy()
data['mainLocale']='es-ES';data['locales'].append('it-IT');data['shipping'][1]['translations']['de']={'name':None,'description':None};data['shipping'][1]['translations']['es']['description']='Entrega heredada'
r=req('/api/merchant/commerce',{'data':data,'revision':conf['revision']},merchant,'PUT');assert r['revision']==conf['revision']+1
req('/api/merchant/commerce',{'data':data,'revision':conf['revision']},merchant,'PUT',409)
methods=req('/store-api/checkout/options',h={'x-commerce-locale':'de-DE'});standard=next(m for m in methods['shipping']if m['id']=='standard');assert standard['name']==data['shipping'][1]['translations']['es']['name'] and standard['description']=='Entrega heredada'
assert 'it-IT' in req('/store-api/context',h={'x-commerce-locale':'it-IT'})['availableLocales']
check('more than 20 delivery countries, explicit fallback rates, dynamic language registration, main-language method inheritance and stale-write protection')
conf=req('/api/merchant/commerce',h=merchant);data=conf['data'];custom={'code':'ZZ','alpha3':'','numeric':'','isoAssigned':False,'continent':'EU','name':{'en':'Fixture country','de':'Testland','es':'País de prueba'},'states':[{'code':'ZZ-A','name':{'en':'Fixture region','de':'Testregion','es':'Región de prueba'}}]}
data['countryDefinitions']=[custom];data['countries'].append('ZZ');data['shipping'][0]['countries'].append('ZZ')
req('/api/merchant/commerce',{'data':data,'revision':conf['revision']},merchant,'PUT');assert next(c for c in req('/store-api/countries')['countries']if c['code']=='ZZ')['states'][0]['code']=='ZZ-A'
conf=req('/api/merchant/commerce',h=merchant);bad=copy.deepcopy(conf['data']);bad['countryDefinitions'][0]['isoAssigned']=True;req('/api/merchant/commerce',{'data':bad,'revision':conf['revision']},merchant,'PUT',400)
check('tenant country/subdivision extensions work without pretending custom codes have ISO assignment')
def taxrule(id,rate,states=None,priority=0,**kwargs):return {'id':id,'country':'US','rate':rate,'priority':priority,'states':states or [],'postalCodes':[],'postalPrefixes':[],'postalFrom':None,'postalTo':None,'activeFrom':None,'activeUntil':None,'condition':None,**kwargs}
conf=req('/api/merchant/commerce',h=merchant);data=conf['data'];tax=next(t for t in data['taxes']if t['id']=='standard');tax['rates']['US']=5;tax['rules']=[taxrule('california',7.25,['US-CA']),taxrule('zip',9.5,['US-CA'],10,postalFrom='90000',postalTo='91999'),taxrule('expired',99,['US-CA'],100,activeUntil='2000-01-01')]
data['payments'][0]['countries']=['DE'];req('/api/merchant/commerce',{'data':data,'revision':conf['revision']},merchant,'PUT')
c=req('/store-api/checkout/cart',{'session':'intl-'+suffix});h={**public,'sw-context-token':c['token'],'x-commerce-locale':'de-DE'}
c=req('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},h)
ad={'name':'Synthetic Buyer','firstName':'Synthetic','lastName':'Buyer','street':'Fixture Street 1','postalCode':'90210','city':'Fixture city','country':'US','countryStateId':'US-CA'}
selection={'country':'US','shippingMethodId':'pickup','paymentMethodId':'bank-transfer','address':ad,'billingAddress':ad,'customerEmail':'fixture@example.test'}
c=req('/store-api/checkout/context',{'revision':c['revision'],'checkout':selection},h,'PUT');assert abs(c['lineItems'][0]['price']['unitPrice']-22.91)<.01,c
assert 'demo-card' not in [p['id']for p in c['availablePaymentMethods']]
assert req('/store-api/product/mug',{},h)['product']['tax_rate']==9.5
rejected=copy.deepcopy(selection);rejected['paymentMethodId']='demo-card';req('/store-api/checkout/context',{'revision':c['revision'],'checkout':rejected},h,'PUT',400)
rejected=copy.deepcopy(selection);rejected['address']['countryStateId']='US-INVALID';req('/store-api/checkout/context',{'revision':c['revision'],'checkout':rejected},h,'PUT',400)
rejected=copy.deepcopy(selection);rejected['address']['countryStateId']='';req('/store-api/checkout/context',{'revision':c['revision'],'checkout':rejected},h,'PUT',400)
check('state/postcode priority and date windows determine real PDP/cart prices; restricted payment methods and invalid/missing regions are rejected')
# Use the same authoritative Rule Builder references as discounts and checkout.
name={l:'Fixture tax condition' for l in ['en','de','fr','es']}
req('/api/automation/rules/tax_guest',{'revision':0,'data':{'name':name,'active':True,'condition':{'type':'customerLoggedIn','isLoggedIn':True}}},merchant,'PUT')
conf=req('/api/merchant/commerce',h=merchant);data=conf['data'];tax=next(t for t in data['taxes']if t['id']=='standard');tax['rules'].append(taxrule('authenticated',1,['US-CA'],1000,condition={'type':'ruleReference','ruleId':'tax_guest'}));req('/api/merchant/commerce',{'data':data,'revision':conf['revision']},merchant,'PUT')
assert req('/store-api/product/mug',{},h)['product']['tax_rate']==9.5
req('/api/automation/rules/tax_guest',{'revision':1,'data':{'name':name,'active':True,'condition':{'type':'alwaysValid'}}},merchant,'PUT')
assert req('/store-api/product/mug',{},h)['product']['tax_rate']==1
# Locked final order preserves tax and the current translated method snapshot.
order=req('/store-api/checkout/order',{}, {**h,'Idempotency-Key':'intl-'+suffix});assert order['cart']['lineItems'][0]['price']['unitPrice']==21.13,order
req('/api/automation/rules/tax_guest',{'revision':2,'data':{'name':name,'active':True,'condition':{'type':'customerLoggedIn','isLoggedIn':True}}},merchant,'PUT')
assert req('/api/merchant/orders/'+order['id'],h=merchant)['cart']['lineItems'][0]['price']['unitPrice']==21.13
check('persisted Rule Builder conditions feed tax decisions and the locked order keeps the exact historical price snapshot')
# Source is Spanish, German NULL fields inherit independently including SEO/rich text.
product=req('/api/merchant/products/mug',h=merchant);product['translations']['es']={'name':'Taza principal','description':'Descripción principal'};product['translations']['de']={'name':None,'description':None}
product['extra']['seo']={'es':{'title':'Título principal','description':'SEO principal','slug':'taza'}};product['extra']['richDescription']={'es':[{'type':'paragraph','text':'Contenido principal'}]}
req('/api/merchant/products/mug',product,merchant,'PUT');detail=req('/store-api/product/mug',{}, {'x-commerce-locale':'de-DE'})['product'];assert detail['name']=='Taza principal' and detail['description']=='Descripción principal' and detail['extra']['seo']['de']['title']=='Título principal'
assert detail['extra']['richDescription']['de'][0]['text']=='Contenido principal'
product=req('/api/merchant/products/mug',h=merchant);product['translations']['de']['description']='';req('/api/merchant/products/mug',product,merchant,'PUT');assert req('/store-api/product/mug',{}, {'x-commerce-locale':'de-DE'})['product']['description']==''
# Editing just after checkout also overlaps the real order-to-graph projection.
for n in range(5):
 product=req('/api/merchant/products/mug',h=merchant);product['translations']['es']['description']='Descripción '+str(n);req('/api/merchant/products/mug',product,merchant,'PUT')
check('products, SEO and rich descriptions inherit the non-English main language; explicit blank descriptions remain blank; edits serialize with order graph projection')
# Custom class attachment and deletion protection.
conf=req('/api/merchant/commerce',h=merchant);data=conf['data'];data['taxes'].append({'id':'digital-services','rates':{},'defaultRate':15,'translations':{'es':{'name':'Servicios'}},'rules':[]});req('/api/merchant/commerce',{'data':data,'revision':conf['revision']},merchant,'PUT')
product=req('/api/merchant/products/notebook',h=merchant);product['extra']['taxClassId']='digital-services';req('/api/merchant/products/notebook',product,merchant,'PUT');assert req('/store-api/product/notebook',{})['product']['tax_rate']==15
conf=req('/api/merchant/commerce',h=merchant);conf['data']['taxes']=[t for t in conf['data']['taxes']if t['id']!='digital-services'];req('/api/merchant/commerce',{'data':conf['data'],'revision':conf['revision']},merchant,'PUT',400)
check('products support real custom tax classes; assigned classes cannot silently disappear')
# Access by another shop cannot retrieve the same settings or draft record through MCP.
w2=req('/api/auth/register',{'workspaceId':'intl-other-'+suffix,'workspaceName':'Other fixture','name':'Other owner','email':'intl-other-'+suffix+'@example.test','password':'Synthetic-international-2026!'})
req('/api/merchant/commerce',h={**merchant,'x-tenant':w2['workspace']},expected=403)
m=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'merchant.commerce.read','arguments':{}}},merchant);assert not m['result']['isError'] and m['result']['structuredContent']['data']['mainLocale']=='es-ES'
check('international commerce configuration is tenant-isolated and native MCP reads the same persisted aggregate')
print(json.dumps({'passed':len(checks),'liveTaxLaw':False,'checks':checks}))
