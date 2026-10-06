#!/usr/bin/env python3
"""Real registration/address/login/checkout lifecycle, ownership, CAS and immutable financial snapshots."""
import os,json,uuid,urllib.request,urllib.error,concurrent.futures
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787');suffix=uuid.uuid4().hex[:12];checks=[];password='Synthetic-address-2026!'
def call(path,body=None,h=None,method=None,expected=200,binary=False):
    req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET'if body is None else'POST'))
    try:
        with urllib.request.urlopen(req,timeout=30)as res:code=res.status;raw=res.read()
    except urllib.error.HTTPError as err:code=err.code;raw=err.read()
    assert code in (expected if isinstance(expected,tuple)else(expected,)),(path,code,expected,raw.decode(errors='replace'))
    return raw if binary else json.loads(raw)
def passed(s):checks.append(s);print('PASS',s,flush=True)
def shop(label):
    v=call('/api/auth/register',{'workspaceId':label+'-'+suffix,'workspaceName':label,'name':'Owner','email':label+suffix+'@example.test','password':password})
    return v['workspace'],{'x-tenant':v['workspace'],'Authorization':'Bearer '+v['token']}
t,mh=shop('addresses');foreign,fmh=shop('addressforeign');public={'x-tenant':t,'x-commerce-locale':'de-DE'}
# Region fields now admit configured subdivisions rather than arbitrary free text.
configuration=call('/api/merchant/commerce',h=mh)
germany=next(c for c in call('/store-api/countries',h=public)['countries'] if c['code']=='DE')
germany['states']=[{'code':'DE-BE','name':{'en':'Berlin','de':'Berlin','es':'Berlín','fr':'Berlin'}}]
configuration['data']['countryDefinitions']=[germany]
call('/api/merchant/commerce',configuration,mh,'PUT')
billing={'firstName':'Ada','lastName':'Lovelace','name':'Ada Lovelace','company':'Example GmbH','department':'Research','vatId':'DE-TEST','title':'Dr.','salutationId':'not_specified','street':'Billingstrasse 1','additionalAddressLine1':'Hof A','additionalAddressLine2':'Etage 3','postalCode':'10115','city':'Berlin','country':'DE','countryStateId':'DE-BE','phoneNumber':'+49 30 12345'}
shipping={**billing,'street':'Shippingstrasse 9','company':'','department':'','city':'Potsdam','postalCode':'14467'}
email='ada'+suffix+'@example.test';reg=call('/store-api/account/register',{'name':'Ada Lovelace','firstName':'Ada','lastName':'Lovelace','company':'Example GmbH','email':email,'password':password,'billingAddress':billing,'shippingAddress':shipping,'group':'business'},public)
ch={**public,'x-customer-token':reg['customerToken']};p=call('/store-api/account/profile',h=ch);book=p['addresses'];bid=book['defaultBillingAddressId'];sid=book['defaultShippingAddressId'];assert bid!=sid and len(book['elements'])==2 and p['customerGroup']=='consumer' and p['customerNumber'].startswith('C-') and p['languageId']=='de-DE'
assert p['firstName']=='Ada' and p['company']=='Example GmbH';assert all('password'not in k for k in p)
passed('Registration atomically stores structured contacts and separate default billing/shipping addresses with server-owned customer identity')
call('/store-api/account/profile',h={**ch,'x-tenant':foreign},expected=401);call('/store-api/account/addresses',h=public,expected=401)
other=call('/store-api/account/register',{'name':'Other Buyer','email':'other'+email,'password':password},public);oh={**public,'x-customer-token':other['customerToken']}
call('/store-api/account/addresses/'+bid,{'revision':1,'address':billing},oh,'PUT',409);call('/store-api/account/addresses/'+bid,{'revision':1},oh,'DELETE',409)
assert call('/store-api/account/addresses',h=oh)['elements']==[];assert email not in [c['email'] for c in call('/api/merchant/customers',h=fmh)['elements']];call('/api/merchant/customers/'+email,h={**fmh,'x-tenant':t},expected=403)
passed('Customer sessions and composite database ownership prevent cross-customer and cross-shop reads/writes')
new=call('/store-api/account/addresses',{'address':{**billing,'street':'New Lane 2'},'defaultShipping':True},ch);entry=next(e for e in call('/store-api/account/addresses',h=ch)['elements']if e['id']==new['id'])
edit={'revision':entry['revision'],'address':{**entry['address'],'street':'New Lane 3'},'defaultBilling':True}
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex:
    results=list(ex.map(lambda _:call('/store-api/account/addresses/'+new['id'],edit,ch,'PUT',expected=(200,409)),range(2)))
assert sum(bool(x.get('saved'))for x in results)==1;call('/store-api/account/addresses/'+new['id'],edit,ch,'PUT',409);assert call('/store-api/account/addresses',h=ch)['defaultBillingAddressId']==new['id']
call('/store-api/account/addresses/'+new['id'],{'revision':2},ch,'DELETE');book=call('/store-api/account/addresses',h=ch);assert book['defaultBillingAddressId'] is None and book['defaultShippingAddressId'] is None
call('/store-api/account/addresses/'+bid,{'revision':1,'address':billing,'defaultBilling':True},ch,'PUT');call('/store-api/account/addresses/'+sid,{'revision':1,'address':shipping,'defaultShipping':True},ch,'PUT')
passed('Address CRUD checks revisions and clears deleted defaults without dangling or foreign address references')
contact=call('/store-api/account/profile',h=ch)['profile'];contact.update({'birthday':'2000-02-29','phoneNumber':'+49 30 9999','vatIds':['DE-TEST'],'defaultPaymentMethodId':'demo-card','address':None})
call('/store-api/account/profile',contact,ch,'PUT');call('/store-api/account/profile',{**contact,'birthday':'2026-02-31'},ch,'PUT',400);call('/store-api/account/profile',{**contact,'customerGroup':'business'},ch,'PUT',400);call('/store-api/account/profile',{**contact,'defaultPaymentMethodId':'invoice'},ch,'PUT',400)
passed('Contact fields validate dates and payment eligibility; customers cannot self-assign price groups')
cart=call('/store-api/checkout/cart',{},public);h={**public,'sw-context-token':cart['token']};oldtoken=cart['token'];cart=call('/store-api/account/login',{'email':email,'password':password},h);h['sw-context-token']=cart['token'];h['x-customer-token']=cart['customerToken'];ch['x-customer-token']=cart['customerToken']
assert oldtoken!=cart['token'] and cart['customerId']==p['id'] and cart['checkout']['billingAddress']['street']==billing['street'] and cart['checkout']['address']['street']==shipping['street'];assert call('/store-api/account/profile',h=ch)['firstLogin']
call('/store-api/checkout/cart',h={**public,'sw-context-token':oldtoken},expected=404)
cart=call('/store-api/checkout/cart',{},ch);h['sw-context-token']=cart['token'];assert cart['customerId']==p['id'] and cart['checkout']['billingAddressId']==bid
passed('Login rotates the context and applies saved addresses/payment defaults; an existing session restores the same account context')
cart=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},h)
otheraddress=call('/store-api/account/addresses',{'address':{**billing,'name':'Other Buyer','firstName':'Other','lastName':'Buyer'}},oh)['id']
selection={**cart['checkout'],'billingAddressId':otheraddress};call('/store-api/checkout/context',{'revision':cart['revision'],'checkout':selection},h,'PUT',404)
call('/store-api/checkout/context',{'revision':cart['revision'],'checkout':cart['checkout']},{k:v for k,v in h.items()if k!='x-customer-token'},'PUT',401)
selection={**cart['checkout'],'billingAddressId':bid,'shippingAddressId':sid,'shippingMethodId':'standard'};cart=call('/store-api/checkout/context',{'revision':cart['revision'],'checkout':selection},h,'PUT')
order=call('/store-api/checkout/order',{}, {**h,'Idempotency-Key':'address-order-'+suffix});oid=order['id']
assert order['orderCustomer']['customerId']==p['id'] and not order['orderCustomer']['guest'] and order['orderCustomer']['email']==email;assert order['billingAddress']['street']==billing['street'] and order['shippingAddress']['street']==shipping['street'];assert order['billingAddressId']!=bid and order['shippingAddressId']!=sid and order['orderDateTime'].endswith('Z')
passed('Checkout resolves only owned address IDs and snapshots distinct customer/billing/shipping records into the committed order')
book=call('/store-api/account/addresses',h=ch);be=next(e for e in book['elements']if e['id']==bid);call('/store-api/account/addresses/'+bid,{'revision':be['revision'],'address':{**billing,'street':'Changed After Purchase 99'}},ch,'PUT');call('/store-api/account/profile',{**contact,'name':'Changed Name'},ch,'PUT')
read=call('/api/merchant/orders/'+oid,h=mh);assert read['billingAddress']['street']==billing['street'] and read['orderCustomer']['name']=='Ada Lovelace';owned=call('/store-api/account/orders',h=ch)['elements'];assert owned[0]['id']==oid and 'token'not in owned[0]['cart'];assert call('/store-api/account/orders',h=oh)['elements']==[]
p=call('/store-api/account/profile',h=ch);assert p['orderCount']==1 and p['lastPaymentMethodId']=='demo-card' and p['lastOrderDate']
passed('Later address/contact changes cannot rewrite order snapshots; account history and derived order metrics stay customer-owned')
# Central seller data -> PDF uses billing address, not a delivery address.
call('/api/settings/master-data',{'revision':0,'data':{'name':'Synthetic Seller','address':'Seller Road 1','taxId':'TEST','email':'seller@example.test'}},mh,'PUT')
receipt=call('/api/merchant/orders/'+oid+'/receipts',{'revision':read['revision'],'kind':'invoice','locale':'de','requestKey':'addr-pdf-'+suffix},mh)
pdf=call('/api/merchant/receipts/'+receipt['id']+'/pdf',h=mh,binary=True);assert billing['street'].encode()in pdf and shipping['street'].encode()not in pdf
passed('Central master data and immutable billing snapshot feed the generated invoice')
# Storefront purchase care: same ownership predicate for details and binary financial documents.
detail=call('/store-api/account/orders/'+oid,h=ch)
assert detail['id']==oid and detail['billingAddress']['street']==billing['street']
assert detail['receipts'][0]['id']==receipt['id'] and detail['receipts'][0]['number']==receipt['number']
assert 'automation' not in detail and 'activity' not in detail and 'token' not in detail['cart'] and 'checkout' not in detail['cart']
customer_pdf=call(detail['receipts'][0]['pdfPath'],h=ch,binary=True)
assert customer_pdf==pdf
call('/store-api/account/orders/'+oid,h=public,expected=401)
call('/store-api/account/orders/'+oid,h=oh,expected=404)
call('/store-api/account/orders/'+oid,h={**ch,'x-tenant':foreign},expected=401)
call(detail['receipts'][0]['pdfPath'],h=oh,expected=404)
call('/store-api/account/orders/'+oid+'/receipts/not-owned/pdf',h=ch,expected=404)
call('/store-api/account/orders/not-owned/receipts/'+receipt['id']+'/pdf',h=ch,expected=404)
# Bad tracking URLs fail before committing a revision/event; valid HTTPS metadata follows the state machine.
read=call('/api/merchant/orders/'+oid,h=mh)
ship={'revision':read['revision'],'kind':'delivery','state':'shipped','trackingCode':'SYNTHETIC-TRACK','trackingUrl':'javascript:alert(1)'}
call('/api/merchant/orders/'+oid+'/transition',ship,mh,expected=400)
assert call('/api/merchant/orders/'+oid,h=mh)['revision']==read['revision']
for invalid in ['https://user:secret@example.test/track','https://example.test/track\\bad','http://example.test/track']:
    call('/api/merchant/orders/'+oid+'/transition',{**ship,'trackingUrl':invalid},mh,expected=400)
call('/api/merchant/orders/'+oid+'/transition',{**ship,'trackingUrl':'https://tracking.example.test/parcel/SYNTHETIC-TRACK'},mh)
detail=call('/store-api/account/orders/'+oid,h=ch)
assert detail['deliveries'][0]['state']=='shipped' and detail['deliveries'][0]['trackingCode']=='SYNTHETIC-TRACK' and detail['deliveries'][0]['trackingUrl'].startswith('https://tracking.example.test/')
passed('Customer order details, immutable PDF access and shipping links are owner/tenant scoped; unsafe tracking cannot mutate revisions')

# Guest may use own typed addresses, but a matching email grants no account/address/order access.
guest=call('/store-api/checkout/cart',{},public);gh={**public,'sw-context-token':guest['token']};guest=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'notebook','quantity':1}]},gh)
gsel={**guest['checkout'],'customerEmail':email,'billingAddress':billing,'address':shipping,'billingAddressId':None,'shippingAddressId':None};guest=call('/store-api/checkout/context',{'revision':guest['revision'],'checkout':gsel},gh,'PUT');gorder=call('/store-api/checkout/order',{}, {**gh,'Idempotency-Key':'guest-order-'+suffix});assert gorder['orderCustomer']['guest'] and gorder['orderCustomer']['customerId'] is None
assert [o['id']for o in call('/store-api/account/orders',h=ch)['elements']]==[oid]
passed('Guest checkout records contact and addresses without inheriting an existing customer identity or exposing orders to that email')
config=call('/api/merchant/commerce',h=mh);config['data']['payments'].append({'id':'bank','name':'Bank transfer','active':True,'businessOnly':False,'mode':'manual'});call('/api/merchant/commerce',{'revision':config['revision'],'data':config['data']},mh,'PUT')
cart=call('/store-api/checkout/cart',{},public);bh={**public,'sw-context-token':cart['token']};cart=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'notebook','quantity':1}]},bh);cart=call('/store-api/checkout/context',{'revision':cart['revision'],'checkout':{**cart['checkout'],'paymentMethodId':'bank'}},bh,'PUT');call('/store-api/checkout/order',{}, {**bh,'Idempotency-Key':'invalid-bank-'+suffix},expected=400)
cart=call('/store-api/checkout/context',{'revision':cart['revision'],'checkout':{**cart['checkout'],'customerEmail':'guest@example.test','billingAddress':billing}},bh,'PUT');paid=call('/store-api/checkout/order',{}, {**bh,'Idempotency-Key':'valid-bank-'+suffix});assert paid['payment']['state']=='pending' and paid['payment']['provider']=='manual'
passed('Financial/manual checkout requires contact and billing data; complete guest checkout creates a pending native payment')
# MCP uses identical address implementation and current per-user permissions.
def mcp(name,args,h):return call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}},h)['result']
assert not mcp('merchant.customer.addresses',{'id':email},mh)['isError'];assert not mcp('merchant.customer.address.save',{'id':email,'address':billing},mh)['isError'];assert mcp('merchant.customer.addresses',{'id':email},fmh)['isError']
passed('Address book operations are MCP-ready through the same tenant ownership and scoped permission path')
# Password rotation keeps the submitted replacement session and revokes every prior session.
old_customer_token=ch['x-customer-token'];new_password='Synthetic-replacement-2026!'
changed=call('/store-api/account/password',{'oldPassword':password,'newPassword':new_password},ch)
call('/store-api/account/profile',h=ch,expected=401)
ch['x-customer-token']=changed['customerToken'];assert call('/store-api/account/profile',h=ch)['email']==email
fresh_login=call('/store-api/checkout/cart',{},public);login_headers={**public,'sw-context-token':fresh_login['token']}
call('/store-api/account/login',{'email':email,'password':password},login_headers,expected=401)
relogged=call('/store-api/account/login',{'email':email,'password':new_password},login_headers)
assert relogged['customerToken']!=old_customer_token
passed('Password rotation invalidates prior sessions and the old password; the replacement session and new login remain usable')
# Equal-timestamp orders cross the page boundary without duplicates or foreign cursor admission.
if os.getenv('TEST_DATABASE'):
    import subprocess
    sql=f"""BEGIN; SET LOCAL rac.system='on';
    INSERT INTO carts(id,tenant,token,data,status)
      SELECT 'page-cart-'||i::text||'-{suffix}',tenant,'page-token-'||i::text||'-{suffix}',data,'ordered'
      FROM carts CROSS JOIN generate_series(1,100) i WHERE id=(SELECT cart_id FROM orders WHERE id='{oid}');
    INSERT INTO orders(id,tenant,cart_id,idempotency_key,fingerprint,data,created_at)
      SELECT 'page-order-'||i::text||'-{suffix}',tenant,'page-cart-'||i::text||'-{suffix}','page-key-'||i::text||'-{suffix}','fixture',
      jsonb_set(data,'{{id}}',to_jsonb('page-order-'||i::text||'-{suffix}')),created_at-interval '1 minute'
      FROM orders CROSS JOIN generate_series(1,100) i WHERE id='{oid}'; COMMIT;"""
    subprocess.run(['docker','exec','-i',os.environ['TEST_DB_CONTAINER'],'psql','-U','commerce','-d',os.environ['TEST_DATABASE'],'-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
    first=call('/store-api/account/orders',h=ch);second=call('/store-api/account/orders?after='+first['nextCursor'],h=ch)
    assert len(first['elements'])==100 and len(second['elements'])==1 and second['nextCursor'] is None
    assert len({o['id']for o in first['elements']+second['elements']})==101
    call('/store-api/account/orders?after='+oid,h=oh,expected=404)
    call('/store-api/account/orders?after=missing',h=ch,expected=404)
    passed('Account history paginates tied timestamps without duplicates and refuses another customer order as a cursor')
fresh=call('/store-api/checkout/cart',{},ch);h['sw-context-token']=fresh['token'];h['x-customer-token']=ch['x-customer-token'];call('/store-api/account/logout',{},h);call('/store-api/account/profile',h=ch,expected=401);call('/store-api/checkout/cart',h=h,expected=404)
passed('Logout revokes the independent customer session and invalidates its open authenticated cart')
print(json.dumps({'passed':len(checks),'actualDatabase':True,'externalPayments':False}))
