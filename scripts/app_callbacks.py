#!/usr/bin/env python3
"""Real app identity, separate PII consent, digest/creator fences and foreign-object tests. No paid services."""
from testing.app_approval import consent
import copy,json,os,pathlib,urllib.request,urllib.error,uuid
BASE=os.environ['BASE_URL'];ROOT=pathlib.Path(__file__).resolve().parents[1];checks=[]
def call(path,body=None,h=None,method=None,expected=200):
 if path == '/api/apps' and isinstance(body,dict) and ('manifest' in body or 'builtIn' in body): body=consent(body)
 req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as response:code=response.status;result=json.load(response)
 except urllib.error.HTTPError as error:code=error.code;result=json.load(error)
 assert code==expected,(path,code,expected,result)
 return result
def passed(message):checks.append(message);print('PASS',message)
def user():
 uid=uuid.uuid4().hex[:12]
 return call('/api/auth/register',{'name':'App identity fixture','email':uid+'@example.test','password':'Synthetic-callback-2026!','workspaceId':'callbacks-'+uid,'workspaceName':'Callbacks'})
a,b=user(),user();h={'Authorization':'Bearer '+a['token'],'x-tenant':a['workspace']};oh={'Authorization':'Bearer '+b['token'],'x-tenant':b['workspace']}
m=json.loads((ROOT/'extensions/apps/care-studio/manifest.json').read_text());m['id']='callback_'+uuid.uuid4().hex[:8];m['permissions']+=['orders.read','customers.read','customers.pii','products.read','products.write','assets.read']
call('/api/apps',{'manifest':m},h);installed=next(p for p in call('/api/apps',h=h)['packages'] if p['id']==m['id']);digest=installed['digest']
prefix='/api/apps/'+m['id'];access=call(prefix+'/credentials',h=h);assert access['digest']==digest and 'customers.pii' in access['permissions']
def key(permissions,expected=200,extra=None):return call(prefix+'/credentials',{'digest':digest,'approve':True,'permissions':permissions,'expiresInDays':1,**(extra or {})},h,expected=expected)
key(['customers.pii'],400);key(['orders.write'],400);key(['products.read'],409,{'digest':'0'*64});key(['products.read'],409,{'approve':False});key(['products.read'],400,{'expiresInDays':91})
k=key(['orders.read','customers.read','products.read']);kh={'Authorization':'Bearer '+k['key'],'x-tenant':a['workspace']}
for path,method,body in [('/api/merchant/orders',None,None),('/mcp','POST',{'jsonrpc':'2.0','id':1,'method':'tools/list'}),('/api/apps','GET',None),('/store-api/checkout/cart','POST',{}),('/api/apps/other/core/product','POST',{'id':'lamp'})]:call(path,body,kh,method,403)
assert call(prefix+'/core/product',{'id':'lamp'},kh)['id']=='lamp'
call(prefix+'/core/product_save',{'id':'lamp','product':{}},kh,expected=403)
call(prefix+'/core/assets',{},kh,expected=403)
asset_key=key(['assets.read']); ah={**kh,'Authorization':'Bearer '+asset_key['key']}
assert call(prefix+'/core/assets',{},ah)['elements']==[]
call(prefix+'/core/product',{'id':'lamp'},ah,expected=403)
call(prefix+'/core/product',{'id':'lamp'},{**kh,'x-tenant':b['workspace']},expected=403)
call(prefix+'/credentials',h=oh,expected=404)
assert k['key'] not in json.dumps(call(prefix+'/credentials',h=h)) and all('key' not in item for item in call(prefix+'/credentials',h=h)['keys'])
passed('Explicit consent/expiry and current digest bind a one-shop app identity; ordinary HTTP/MCP and other apps remain inaccessible')
# Create a registered shopper and a real bank-transfer order through the existing checkout.
pub={'x-tenant':a['workspace']};email=uuid.uuid4().hex+'@example.test';customer=call('/store-api/account/register',{'name':'Private Buyer','email':email,'password':'Synthetic-callback-buyer-2026!'},pub)
cart=call('/store-api/checkout/cart',{'session':'callback-'+uuid.uuid4().hex},pub);ch={**pub,'sw-context-token':cart['token']}
login=call('/store-api/account/login',{'email':email,'password':'Synthetic-callback-buyer-2026!'},ch);ch['sw-context-token']=login['token']
cart=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},ch)
address={'name':'Private Buyer','firstName':'Private','lastName':'Buyer','street':'PII SENTINEL STREET 1','postalCode':'10115','city':'Fixture','country':'DE'}
call('/store-api/checkout/context',{'revision':cart['revision'],'checkout':{'country':'DE','shippingMethodId':'pickup','paymentMethodId':'bank-transfer','address':address,'billingAddress':address,'customerEmail':email}},ch,'PUT')
order=call('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':'callback-'+uuid.uuid4().hex})
full=call('/api/merchant/orders/'+order['id'],h=h);customer_id=full['orderCustomer']['customerId']
redacted=call(prefix+'/core/order',{'id':order['id']},kh);redacted_customer=call(prefix+'/core/customer',{'id':customer_id},kh)
assert redacted['id']==order['id'] and redacted_customer['id']==customer_id
assert email not in json.dumps([redacted,redacted_customer]) and 'PII SENTINEL' not in json.dumps([redacted,redacted_customer])
assert 'cart' not in redacted and 'addresses' not in redacted_customer
pii=key(['orders.read','customers.read','customers.pii']);ph={'Authorization':'Bearer '+pii['key'],'x-tenant':a['workspace']}
assert call(prefix+'/core/order',{'id':order['id']},ph)['customerEmail']==email
assert call(prefix+'/core/customer',{'id':customer_id},ph)['email']==email
call(prefix+'/core/customer',{'id':uuid.uuid4().hex},ph,expected=404)
call(prefix+'/core/order',{'id':uuid.uuid4().hex},ph,expected=404)
passed('Real order/customer callbacks project no personal data without PII consent; separately approved PII reaches the same existing domain operations')
# Foreign objects must remain unavailable even if their UUIDs are known.
foreign_draft=call('/api/merchant/products/lamp',h=oh);foreign_draft['id']='foreign_'+uuid.uuid4().hex[:8];foreign_draft['revision']=0;foreign_draft['commerce']['stock']=3;foreign_draft['catalog']['productNumber']='FOREIGN-'+uuid.uuid4().hex[:8]
foreign_product=call('/api/merchant/products',foreign_draft,oh)
foreign_product=call('/api/merchant/products/'+foreign_product['id'],h=oh)
call(prefix+'/core/product',{'id':foreign_product['id']},kh,expected=404)
write=key(['products.read','products.write']);wh={'Authorization':'Bearer '+write['key'],'x-tenant':a['workspace']}
product=call(prefix+'/core/product',{'id':'lamp'},wh);product['commerce']['stock']+=1
call(prefix+'/core/product_save',{'id':'lamp','product':product},wh)
call(prefix+'/core/product_save',{'id':'lamp','product':product},wh,expected=409)
call(prefix+'/core/product_save',{'id':foreign_product['id'],'product':foreign_product},wh,expected=404)
assert call('/api/merchant/products/'+foreign_product['id'],h=oh)['commerce']['stock']==3
log=call(prefix+'/activity',h=h)['calls'];assert any(c['action']=='core_product_save' and c['status']==409 for c in log)
assert email not in json.dumps(log) and 'PII SENTINEL' not in json.dumps(log)
passed('Product callbacks use existing revisions and tenant ownership; denied writes preserve foreign state, and metadata logs include failures without PII')
call(prefix+'/credentials/'+k['id'],h=h,method='DELETE');call(prefix+'/core/product',{'id':'lamp'},kh,expected=401)
# The same service key ceases to authorize after a normal immutable upgrade.
new=copy.deepcopy(m);new['version']='1.0.1';call('/api/apps',{'manifest':new},h)
call(prefix+'/core/product',{'id':'lamp'},wh,expected=401);call(prefix+'/core/order',{'id':order['id']},ph,expected=401)
passed('Revocation and immutable package upgrades immediately invalidate old app credentials')
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
