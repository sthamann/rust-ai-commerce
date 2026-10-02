#!/usr/bin/env python3
"""Real HTTP/PG tests for SKUs, moderated reviews, tax/shipping/payment and deliveries.
Demo orders only. Configuration changes are restored; no PSP is contacted.
"""
import os,json,uuid,urllib.request,urllib.error,concurrent.futures,pathlib,copy
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8787');checks=[]
public={};merchant={}
def req(path,body=None,h=None,method=None,expected=200):
 r=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**public,**(h or {})},method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(r,timeout=30) as response:status=response.status;data=json.load(response)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 assert status==expected,(path,status,expected,data)
 return data
def check(name):checks.append(name);print('PASS',name)
def cart():
 c=req('/store-api/checkout/cart',{'session':'commerce-'+str(uuid.uuid4())});return c,{'sw-context-token':c['token'],'x-commerce-locale':'de-DE'}
def items(c,h,ids):return req('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':pid,'quantity':q} for pid,q in ids]},h,'PUT')
def select(c,h,**patch):return req('/store-api/checkout/context',{'revision':c['revision'],'checkout':{**c['checkout'],**patch}},h,'PUT')
def detail(id,h=None):return req('/store-api/product/'+id,{},h)
suffix=uuid.uuid4().hex[:12]
workspace=req('/api/auth/register',{'workspaceId':'commerce-'+suffix,'workspaceName':'Commerce regression','name':'Synthetic Owner','email':'commerce-'+suffix+'@example.test','password':'Synthetic-commerce-2026!'})
public={'x-tenant':workspace['workspace']};merchant={**public,'Authorization':'Bearer '+workspace['token'],'x-commerce-locale':'de-DE'}
c,h=cart();d=detail('mug',h);assert len(d['variants'])==4 and len(d['product']['media'])==3 and d['product']['properties']['material']=='stoneware';check('detail exposes real SKU family, three images and properties')
for m in d['product']['media']:
 with urllib.request.urlopen(BASE+m['url']) as r:assert r.status==200 and b'<svg' in r.read()
assert d['variants'][1]['parent_id']=='mug';check('all gallery images resolve to authored assets')
dark=detail('chair-dark-oak',h);assert len(dark['variants'])==3 and not any(v['options']=={'color':'dark','material':'walnut'} for v in dark['variants']);check('nonexistent variant combinations are absent')
req('/store-api/product/no-such-sku',{},h,expected=404)
assert not req('/store-api/checkout/options',h=h)['payments'][-1]['businessOnly'];check('consumer options never expose B2B invoice')
rev=d['reviews']['count'];r=req('/store-api/product/mug/reviews',{'author':'HTTP Demo','rating':4,'title':'Commerce test review','content':'Synthetic review exercised through the real route.'},h)
assert r['state']=='pending-moderation' and not r['verifiedPurchase'];assert detail('mug',h)['reviews']['count']==rev
req('/api/merchant/reviews/'+r['id'],{'approved':True},method='PUT',expected=401)
req('/api/merchant/reviews/'+r['id'],{'approved':True},{**merchant,'x-tenant':'workshop'},'PUT',403)
req('/api/merchant/reviews/'+r['id'],{'approved':True},merchant,'PUT');assert detail('mug',h)['reviews']['count']==rev+1
req('/api/merchant/reviews/'+r['id'],{'approved':False},merchant,'PUT');check('review moderation changes public aggregate and is tenant protected')
req('/store-api/product/mug/reviews',{'author':'A','rating':6,'title':'x','content':'x'},h,expected=400)
req('/store-api/product/mug/reviews',{'author':'A','rating':4,'title':'x','content':'x'},h,expected=409);check('invalid ratings and duplicate context reviews rejected')
c=items(c,h,[('mug-sage-350',6)]);assert c['lineItems'][0]['discountPercent']==5 and c['lineItems'][0]['price']['unitPrice']==detail('mug-sage-350',h)['calculatedPrices'][1]['price']['unitPrice'];check('SKU public quantity tier is identical on detail and cart')
guest_email='commerce-'+uuid.uuid4().hex+'@example.test'
address={'name':'Commerce Demo','street':'Teststraße 1','postalCode':'10115','city':'Berlin'}
selection={**c['checkout'],'country':'FR','shippingMethodId':'express','address':address}
req('/store-api/checkout/context',{'revision':c['revision'],'checkout':selection},h,'PUT',400)
req('/store-api/checkout/context',{'revision':c['revision']-1,'checkout':c['checkout']},h,'PUT',409)
req('/store-api/checkout/context',{'revision':c['revision'],'checkout':c['checkout']},{**h,'x-tenant':'workshop'},'PUT',404)
check('country eligibility, revision and tenant isolation enforced')
c=select(c,h,country='FR',shippingMethodId='standard',paymentMethodId='bank-transfer',address=address,customerEmail=guest_email,billingAddress={**address,'country':'FR'})
assert c['lineItems'][0]['price']['calculatedTaxes'][0]['taxRate']==20 and c['price']['totalPrice']!=141.96 and c['shippingCosts']['totalPrice']==4.9
assert round(c['price']['netPrice']+c['price']['tax'],2)==c['price']['totalPrice'];check('destination VAT and proportional shipping included in payable total')
assert detail('mug-sage-350',h)['country']=='FR';assert d['product']['price']!=detail('mug-sage-350',h)['product']['price'];check('detail price follows the actual customer tax country')
snapshot=req('/api/merchant/commerce',h=merchant);sku_stock=detail('mug-sage-350',h)['product']['stock'];base_stock=detail('mug',h)['product']['stock']
key='commerce-order-'+str(uuid.uuid4());oh={**h,'Idempotency-Key':key}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:orders=list(pool.map(lambda _:req('/store-api/checkout/order',{},oh),range(6)))
o=orders[0];assert len({v['id'] for v in orders})==1 and o['payment']['state']=='pending' and o['payment']['provider']=='manual' and not o['payment']['realMoneyCharged']
assert all(o['deliveries'][0]['shippingLocation']['address'][k]==v for k,v in address.items()) and o['deliveries'][0]['shippingLocation']['address']['country']=='FR' and o['orderCustomer']['email']==guest_email and o['deliveries'][0]['deliveryDate']['basis']=='calendar-days';check('concurrent manual-payment checkout snapshots address, method and delivery dates exactly once')
assert detail('mug-sage-350',h)['product']['stock']==sku_stock-6 and detail('mug',h)['product']['stock']==base_stock;check('only the selected SKU stock is decremented')
r2=req('/store-api/product/mug-sage-350/reviews',{'author':'HTTP Demo','rating':5,'title':'Verified demo order','content':'Synthetic purchase already completed.'},h);assert r2['verifiedPurchase'];check('verified review requires an actual order belonging to customer context')
req('/api/merchant/orders/'+o['id']+'/transition',{'revision':1,'kind':'delivery','state':'delivered'},merchant,expected=409)
req('/api/merchant/orders/'+o['id']+'/transition',{'revision':1,'kind':'payment','state':'paid'},expected=401)
o=req('/api/merchant/orders/'+o['id']+'/transition',{'revision':1,'kind':'payment','state':'paid'},merchant)
req('/api/merchant/orders/'+o['id']+'/transition',{'revision':1,'kind':'delivery','state':'shipped'},merchant,expected=409)
o=req('/api/merchant/orders/'+o['id']+'/transition',{'revision':2,'kind':'delivery','state':'shipped','trackingCode':'DEMO-TRACKING'},merchant)
o=req('/api/merchant/orders/'+o['id']+'/transition',{'revision':3,'kind':'delivery','state':'delivered'},merchant)
assert o['payment']['state']=='paid' and o['deliveries'][0]['state']=='delivered' and o['deliveries'][0]['trackingCode']=='DEMO-TRACKING'
assert req('/store-api/checkout/cart',h=h)['order']['revision']==4;check('authorized payment and delivery state transitions persist with optimistic revision')
old=req('/api/merchant/commerce',h=merchant);changed=copy.deepcopy(old['data']);changed['taxes'][0]['rates']['FR']=21;changed['shipping'][1]['price']=7.9
try:
 req('/api/merchant/commerce',{'revision':old['revision']-1,'data':changed},merchant,'PUT',409)
 req('/api/merchant/commerce',{'revision':old['revision'],'data':changed},merchant,'PUT')
 nc,nh=cart();nc=items(nc,nh,[('mug',1)]);nc=select(nc,nh,country='FR',shippingMethodId='standard',address=address)
 assert nc['lineItems'][0]['price']['calculatedTaxes'][0]['taxRate']==21 and nc['shippingCosts']['totalPrice']==7.9
 completed=req('/store-api/checkout/cart',h=h);assert completed['price']==o['cart']['price'];assert req('/store-api/checkout/order',{},oh)['cart']['price']==o['cart']['price']
 check('tax/shipping administration affects new quotes while completed prices remain immutable')
 invalid=copy.deepcopy(changed);invalid['payments']=[{**p,'active':False} for p in invalid['payments']]
 req('/api/merchant/commerce',{'revision':old['revision']+1,'data':invalid},merchant,'PUT',400)
 check('configuration cannot disable all consumer payment methods')
finally:
 current=req('/api/merchant/commerce',h=merchant);req('/api/merchant/commerce',{'revision':current['revision'],'data':old['data']},merchant,'PUT')
recover,rh=cart();recover=items(recover,rh,[('mug',1)]);recover=select(recover,rh,shippingMethodId='standard',address=address)
original=req('/api/merchant/commerce',h=merchant);changed=copy.deepcopy(original['data'])
for method in changed['shipping']:
 if method['id']=='standard':method['active']=False
try:
 req('/api/merchant/commerce',{'revision':original['revision'],'data':changed},merchant,'PUT')
 recovered=req('/store-api/checkout/cart',h=rh)
 assert recovered['selectionNeedsConfirmation'] and recovered['lineItems'][0]['id']=='mug'
 req('/store-api/checkout/order',{}, {**rh,'Idempotency-Key':'recover-'+str(uuid.uuid4())},expected=400)
 recovered=select(recovered,rh,**recovered['checkout']);assert not recovered['selectionNeedsConfirmation']
 check('disabled shipping recovers cart items and requires an explicit valid selection')
finally:
 current=req('/api/merchant/commerce',h=merchant);req('/api/merchant/commerce',{'revision':current['revision'],'data':original['data']},merchant,'PUT')
b,bh=cart();b=req('/store-api/account/login',{'email':'buyer@example.test','password':'demo-business'},bh);bh['sw-context-token']=b['token'];bh['x-customer-token']=b['customerToken'];b=items(b,bh,[('mug-terracotta-500',5)]);b=select(b,bh,paymentMethodId='invoice')
assert b['price']['taxStatus']=='net' and b['lineItems'][0]['discountPercent']==15 and any(v['id']=='invoice' for v in b['availablePaymentMethods']);check('authenticated B2B variants inherit group tiers and invoice eligibility')
z,zh=cart();z=items(z,zh,[('mug-sage-500',1)]);req('/store-api/checkout/order',{}, {**zh,'Idempotency-Key':'sold-'+str(uuid.uuid4())},expected=409);check('sold-out child SKU cannot complete an order')
f,fh=cart();f=items(f,fh,[('chair',1)]);f=select(f,fh,shippingMethodId='standard',address=address);assert f['shippingCosts']['totalPrice']==0;check('free shipping threshold applies to authoritative gross item total')
mx=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'catalog.detail','arguments':{'productId':'mug'}}},fh);assert len(mx['result']['structuredContent']['variants'])==4
mx=req('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'checkout.select','arguments':{'revision':f['revision'],'checkout':{**f['checkout'],'paymentMethodId':'bank-transfer'}}}},fh);assert mx['result']['structuredContent']['paymentMethod']['id']=='bank-transfer';check('MCP detail and checkout selection consume the same native domain path')
report={'suite':'commerce-v4','passed':len(checks),'checks':checks,'payment':'only simulated/manual; no PSP contacted','ordersCreated':1,'configurationRestored':True}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
