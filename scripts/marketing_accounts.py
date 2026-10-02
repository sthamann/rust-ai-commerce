#!/usr/bin/env python3
"""Real isolated shops: customer authority, limited coupons, event flows, channels and selected releases. No paid models."""
import os,json,uuid,urllib.request,urllib.error,time,concurrent.futures
base=os.getenv('BASE_URL','http://127.0.0.1:8787');checks=[]
def call(path,body=None,h=None,expected=200,method=None):
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==expected,(path,code,expected,v)
 return v
def passed(s):checks.append(s);print('PASS',s,flush=True)
uid=uuid.uuid4().hex[:12];a=call('/api/auth/register',{'workspaceId':'full-'+uid,'workspaceName':'Real commerce test','name':'Owner','email':uid+'@example.test','password':'Synthetic-test-2026!'})
extra=call('/api/workspaces',{'workspaceId':'extra-'+uid,'workspaceName':'Second shop'}, {'x-tenant':a['workspace'],'Authorization':'Bearer '+a['token']})
assert extra['user']['id']==a['user']['id'] and len(extra['workspaces'])==2
passed('An existing merchant provisions a second isolated shop under the same account')
t=a['workspace'];mh={'x-tenant':t,'Authorization':'Bearer '+a['token']};sh={'x-tenant':t,'x-commerce-locale':'de-DE'}
name={'en':'Test','de':'Test','fr':'Test','es':'Prueba'}
def config(kind,id,data,rev=0,h=None):return call('/api/automation/'+kind+'/'+id,{'data':data,'revision':rev},h or mh,method='PUT')
def cart(h=None):
 h={**sh,**(h or {})};c=call('/store-api/checkout/cart',{},h);return c,{**h,'sw-context-token':c['token']}
def items(c,h,pairs):return call('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':p,'quantity':q} for p,q in pairs]},h,method='PUT')
def order(c,h):return call('/store-api/checkout/order',{}, {**h,'Idempotency-Key':uuid.uuid4().hex})
def coupon(c,h,code):return call('/store-api/checkout/coupons',{'revision':c['revision'],'codes':[code]},h,method='PUT')
email='customer-'+uid+'@example.test';password='Synthetic-shopper-2026!'
customer=call('/store-api/account/register',{'email':email,'name':'Customer','password':password,'group':'business'},sh)
ch={**sh,'x-customer-token':customer['customerToken']};assert call('/store-api/account/profile',h=ch)['customerGroup']=='consumer'
call('/store-api/account/profile',h={**ch,'x-tenant':'workshop'},expected=401)
call('/store-api/account/profile',{'name':'Exploit','address':None,'group':'business'},ch,expected=400,method='PUT')
c,h=cart();call('/store-api/account/login',{'email':email,'password':'wrong'},h,expected=401)
c=call('/store-api/account/login',{'email':email,'password':password},h);ch['x-customer-token']=c['customerToken'];h['x-customer-token']=c['customerToken'];h['sw-context-token']=c['token']
call('/store-api/account/profile',{'name':'New name','address':{'name':'New name','street':'Test 1','postalCode':'12345','city':'Test'}},ch,method='PUT')
c=items(c,h,[('mug',1)]);o=order(c,h)
owned=call('/store-api/account/orders',h=ch)['elements'];assert [x['id'] for x in owned]==[o['id']] and 'token' not in owned[0]['cart']
other=call('/store-api/account/register',{'email':'other-'+email,'name':'Other','password':password},sh);assert call('/store-api/account/orders',h={**sh,'x-customer-token':other['customerToken']})['elements']==[]
fresh,fh=cart(ch);assert fresh['customerGroup']=='consumer' and fresh['checkout']['address']['city']=='Test'
old=ch['x-customer-token'];pw=call('/store-api/account/password',{'oldPassword':password,'newPassword':'Changed-shopper-2026!'},ch);call('/store-api/account/profile',h=ch,expected=401)
ch['x-customer-token']=pw['customerToken'];call('/store-api/account/logout',{},ch);call('/store-api/account/profile',h=ch,expected=401)
passed('Customer sessions reject wrong passwords/cross-shop reads, prevent group escalation, isolate history and revoke on password/logout')
rule={'type':'andContainer','children':[{'type':'cartCartAmount','operator':'>=','amount':10},{'type':'customerGroup','values':['consumer']}]}
config('rules','eligible',{'name':name,'active':True,'condition':rule})
config('promotions','once',{'name':name,'active':True,'code':'ONCE','kind':'absolute','amount':1.01,'rule':rule,'exclusive':False,'priority':0,'maxUses':1,'start':None,'end':None})
x,xh=cart();x=items(x,xh,[('mug',1),('notebook',1)]);before=x['price']['positionPrice'];x=coupon(x,xh,'ONCE');assert round(before-x['price']['positionPrice'],2)==1.01 and x['discountTotal']==1.01
assert round(x['price']['netPrice']+x['price']['tax'],2)==x['price']['totalPrice']
# Two different product rows avoid incidental stock serialization masking coupon races.
y,yh=cart();y=items(y,yh,[('lamp',1)]);y=coupon(y,yh,'ONCE')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 orders=list(pool.map(lambda v:order(*v),[(x,xh),(y,yh)]))
assert sum(bool(z['cart']['discounts']) for z in orders)==1,orders
assert not call('/store-api/checkout/cart',h=xh)['discounts'] if not orders[0]['cart']['discounts'] else True
passed('Exact-cent fixed coupon recalculates tax and its single use survives concurrent checkouts on different products')
config('promotions','freeship',{'name':name,'active':True,'code':None,'kind':'free_shipping','amount':0,'rule':{'type':'alwaysValid'},'exclusive':False,'priority':0,'maxUses':None,'start':None,'end':None})
x,xh=cart();x=items(x,xh,[('notebook',1)]);x=call('/store-api/checkout/context',{'revision':x['revision'],'checkout':{**x['checkout'],'shippingMethodId':'standard','address':{'name':'Test','street':'Test 1','postalCode':'12345','city':'Test'}}},xh,method='PUT');assert x['shippingCosts']['totalPrice']==0
passed('Automatic free-shipping campaign changes the real shipping quote')
flow={'name':name,'active':True,'event':'order.placed','condition':{'type':'alwaysValid'},'action':'note','instruction':{'en':'New order','de':'Neue Bestellung','fr':'Nouvelle commande','es':'Nuevo pedido'},'locale':'fr-FR'}
invalid={**flow,'instruction':{}};config_result=call('/api/automation/flows/invalid',{'revision':0,'data':invalid},mh,expected=400,method='PUT')
config('flows','order_note',flow);event_order=order(x,xh)
for _ in range(100):
 jobs=call('/api/automation',h=mh)['jobs']
 completed=[j for j in jobs if j['state']=='completed' and j['result'].get('orderId')==event_order['id']]
 if completed:break
 time.sleep(.2)
assert len(completed)==1 and completed[0]['result']['note']=='Nouvelle commande',jobs
passed('Real committed order event executes one durable localized note flow; malformed translated instructions fail without panic')
config('channels','cups',{'name':name,'active':True,'kind':'headless','locales':['de-DE','en-GB','fr-FR','es-ES'],'productIds':['mug']})
channel={**sh,'sw-sales-channel-id':'cups'};visible=call('/store-api/product',{},channel)['elements'];assert [p['id'] for p in visible]==['mug']
call('/store-api/product/chair',{},channel,expected=404)
c,hh=cart(channel);call('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':'chair','quantity':1}]},hh,expected=404,method='PUT');c=items(c,hh,[('mug-terracotta-500',1)])
call('/store-api/checkout/cart',h={**hh,'sw-sales-channel-id':'default'},expected=403)
handoff=call('/store-api/checkout/handoff',{'revision':c['revision']},hh);assert '&channel=cups#checkout/' in handoff['checkoutPath']
config('channels','only_child',{'name':name,'kind':'headless','active':True,'locales':['de-DE'],'productIds':['mug-terracotta-500']})
child_h={**sh,'sw-sales-channel-id':'only_child'}
assert [p['id'] for p in call('/store-api/product/mug-terracotta-500',{},child_h)['variants']]==['mug-terracotta-500']
passed('Sales channel filters catalog/PDP/SKUs and binds cart and independent-storefront handoff to its channel')
# Product and campaign selection independently preserves live inventory and unselected content.
e=call('/api/environments',{'name':'Metadata and campaign sandbox'},mh);stageh={**mh,'x-tenant':e['id']}
p=call('/api/merchant/products/mug',h=stageh);p['translations']['de']['name']='Neue Tasse';p['extra']={'seo':{},'specifications':{'de':{'Volumen':'500 ml'}},'crossSelling':['notebook'],'shippingFree':True}
call('/api/merchant/products/mug',p,stageh,method='PUT')
config('promotions','staged',{'name':name,'active':True,'code':'STAGE','kind':'percentage','amount':10,'rule':{'type':'alwaysValid'},'exclusive':False,'priority':0,'maxUses':None,'start':None,'end':None},h=stageh)
doc=call('/api/knowledge/documents',{'title':'Staged sheet','productId':'mug','content':'Only the selected source may become live.'},stageh)
call('/api/knowledge/documents/'+doc['id'],{'approve':True,'revision':1,'visibility':'public'},stageh,method='PUT')
diff=call('/api/environments/'+e['id']+'/diff',h=mh)['changes'];selected=[v for v in diff if v['key'] in ['product:mug','document:'+doc['id']]]
assert len(selected)==2, diff
call('/api/environments/'+e['id']+'/release',{'approve':True,'selections':[{'key':v['key'],'digest':v['digest']} for v in selected]},mh)
assert call('/store-api/product/mug',{},sh)['product']['name']=='Neue Tasse'
assert not any(p['id']=='staged' for p in call('/api/automation',h=mh)['promotions'])
assert any(d['id']==doc['id'] and d['visibility']=='public' for d in call('/api/knowledge/documents',h=mh)['elements'])
assert call('/store-api/product/mug',{},sh)['product']['extra']['shippingFree']
family=call('/api/merchant/products/mug',h=mh)
family['extra']={'seo':{},'specifications':{'fr':{'Matière':'Grès'}},'crossSelling':['notebook'],'shippingFree':True}
call('/api/merchant/products/mug',family,mh,method='PUT')
child=call('/store-api/product/mug-terracotta-500',{}, {**sh,'x-commerce-locale':'fr-FR'})['product']
assert child['extra']['specifications']['fr']['Matière']=='Grès' and child['extra']['shippingFree']
passed('Product translations/specifications/free shipping and source documents publish selectively while unselected campaigns stay private')
c,h=cart();ids=[]
for i in range(3):
 event=uuid.uuid4().hex;v=call('/store-api/personalization/events',{'eventId':event,'kind':'view','productId':'lamp'},h);ids.append(event)
assert v['rankedProductIds'][0]=='lamp' and v['adapted']
assert not call('/store-api/personalization/events',{'eventId':ids[-1],'kind':'view','productId':'lamp'},h)['stored']
call('/store-api/personalization/events',{'eventId':uuid.uuid4().hex,'kind':'cart_add','productId':'lamp'},h,expected=400)
call('/store-api/personalization/events',{'eventId':uuid.uuid4().hex,'kind':'view','productId':'unknown'},h,expected=400)
another=call('/store-api/checkout/cart',{}, sh)
other_h={**h,'sw-context-token':another['token']}
assert not call('/store-api/personalization/events',{'eventId':uuid.uuid4().hex,'kind':'view','productId':'lamp'},other_h)['adapted']
call('/store-api/personalization',h=h,method='DELETE');v=call('/store-api/personalization/events',{'eventId':uuid.uuid4().hex,'kind':'view','productId':'lamp'},h);assert not v['adapted']
passed('Persistent behavior is consumed immediately for channel/stock-safe ranking, deduplicates events and can be cleared')
print(json.dumps({'passed':len(checks),'checks':checks,'paidProviderCalls':0},indent=2))
