#!/usr/bin/env python3
"""Real typed WIT host reads, all four quote hooks and checkout persistence/CAS/tenant negative cases."""
import copy,json,os,pathlib,urllib.request,urllib.error,uuid
from testing.app_approval import consent
base=os.environ['BASE_URL'];t='wit-'+uuid.uuid4().hex[:10]
def call(path,body=None,h=None,status=200,method=None):
 if path=='/api/apps' and body is not None:body=consent(body)
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(path,code,status,v);return v
u=call('/api/auth/register',{'workspaceId':t,'name':'WIT owner','email':t+'@example.test','password':'Synthetic-component-password!'})
h={'x-tenant':t,'Authorization':'Bearer '+u['token']};ch={'x-tenant':t}
m=json.loads((pathlib.Path(__file__).resolve().parents[1]/'extensions/apps/snapshot-pricing/manifest.json').read_text())
call('/api/apps',{'manifest':m},h)
c=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},ch);ch['sw-context-token']=c['token']
c=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},ch)
out=c['appHookOutcomes'];assert [r['hook'] for r in out]==['price','discount','shipping','validation'];assert [r['minor'] for r in out]==[24,25,24,0],out
assert c['price']['positionPrice']==24.89 and c['shippingCosts']['totalPrice']==0.24 and c['price']['totalPrice']==25.13,c['price']
c=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':2}]},ch);assert c['appHookOutcomes'][0]['minor']>24,c['appHookOutcomes']
address={'name':'WIT Buyer','firstName':'WIT','lastName':'Buyer','street':'Fixture Street 1','postalCode':'10115','city':'Berlin','country':'DE'}
ctx=call('/store-api/checkout/context',{'revision':c['revision'],'checkout':{'country':'DE','shippingMethodId':'pickup','paymentMethodId':'bank-transfer','address':address,'billingAddress':address,'customerEmail':t+'@example.test'}},ch,method='PUT');c=call('/store-api/checkout/cart',h=ch)
key=uuid.uuid4().hex;oh={**ch,'Idempotency-Key':key,'x-commerce-cart-revision':str(c['revision']),'x-commerce-total-minor':str(round(c['price']['totalPrice']*100))};order=call('/store-api/checkout/order',{},oh);assert order['cart']['appHookOutcomes']==c['appHookOutcomes'];assert call('/store-api/checkout/order',{},oh)['id']==order['id']
print('PASS WIT actual cart reads drive price, discount, shipping and validation; native tax/FX owner, reviewed checkout and idempotent order persist the outcomes')
other=t+'-other';u2=call('/api/auth/register',{'workspaceId':other,'name':'Other WIT owner','email':other+'@example.test','password':'Synthetic-component-password!'})
c2=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},{'x-tenant':other});assert not c2['appHookOutcomes'];assert all(p['id']!='snapshot_pricing' for p in call('/api/apps',h={'x-tenant':other,'Authorization':'Bearer '+u2['token']})['packages'])
invalid=copy.deepcopy(m);invalid['id']='invalid_wit';invalid['commerceHooks']['source']='(component)';call('/api/apps',{'manifest':invalid},h,400)
trapped=copy.deepcopy(m);trapped['id']='trapped_wit';trapped['commerceHooks']['source']=trapped['commerceHooks']['source'].replace('i32.const 256 call $cart','(loop $again i32.const 256 call $cart br $again)');call('/api/apps',{'manifest':trapped},h)
call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},{'x-tenant':t},400)
call('/health')
print('PASS component ABI rejection, tenant isolation and bounded malicious host-call loops leave commerce alive')
