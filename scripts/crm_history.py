#!/usr/bin/env python3
"""Real CRM groups/defaults, transaction-coalesced history, validated restore, tenant/role/MCP isolation."""
import copy,json,os,uuid,urllib.request,urllib.error
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787');suffix=uuid.uuid4().hex[:10];password='Synthetic-history-2026!'
def call(path,body=None,h=None,method=None,expected=200):
 req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==expected,(path,code,expected,v)
 return v
def shop(prefix):
 a=call('/api/auth/register',{'workspaceId':prefix+'-'+suffix,'workspaceName':'CRM history fixture','name':'Fixture Owner','email':prefix+suffix+'@example.test','password':password})
 return a,{'Authorization':'Bearer '+a['token'],'x-tenant':a['workspace']}
a,h=shop('history');foreign,fh=shop('historyother');public={'x-tenant':a['workspace']}
def history(entity,id):return call(f'/api/history/{entity}/{id}',h=h)
def version(entity,id,entry):return call(f'/api/history/{entity}/{id}/{entry}',h=h)
def restore(entity,id,entry,revision,side='before',expected=200):return call(f'/api/history/{entity}/{id}/{entry}/restore',{'approve':True,'revision':revision,'side':side},h,expected=expected)
def mcp(name,args,headers=h):return call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}},headers)['result']
settings=call('/api/merchant/commerce',h=h);assert len(settings['data']['customerGroups'])==2
assert call('/api/merchant/customer-groups',h=h)['elements'][0]['translations']['es-ES']['name']
settings['data']['customerGroups'].append({'id':'vip','priceBasis':'business','translations':{'en-GB':{'name':'VIP trade'},'de-DE':{'name':'VIP Handel'},'es-ES':{'name':'VIP profesional'}}})
call('/api/merchant/commerce',settings,h,'PUT')
address={'name':'Fixture Buyer','firstName':'Fixture','lastName':'Buyer','street':'Billing Lane 1','postalCode':'10115','city':'Berlin','country':'DE'}
email='buyer'+suffix+'@example.test'
reg=call('/store-api/account/register',{'name':'Fixture Buyer','email':email,'password':password,'billingAddress':address,'shippingAddress':{**address,'street':'Delivery Lane 2'},'customerGroup':'vip'},public)
ch={**public,'x-customer-token':reg['customerToken']}
customer=call('/api/merchant/customers/'+email,h=h);assert customer['customerGroup']=='consumer' and len(customer['addresses']['elements'])==2
hist=history('customer',email);assert len(hist['elements'])==1,'Registration must be one aggregate version including both addresses'
assert hist['elements'][0]['actor']=='customer:'+email
assert 'password' not in json.dumps(version('customer',email,hist['elements'][0]['id']))
book=customer['addresses'];bid=book['defaultBillingAddressId'];sid=book['defaultShippingAddressId'];entry=next(e for e in book['elements'] if e['id']==sid)
p='/api/merchant/customers/'+email
call(p+'/addresses/'+sid,{'revision':entry['revision'],'address':entry['address'],'defaultBilling':True,'defaultShipping':False},h,'PUT')
book=call(p+'/addresses',h=h);assert book['defaultBillingAddressId']==sid and book['defaultShippingAddressId']==sid
entry=next(e for e in book['elements'] if e['id']==bid)
call(p+'/addresses/'+bid,{'revision':entry['revision'],'address':entry['address'],'defaultShipping':True},h,'PUT')
book=call(p+'/addresses',h=h);assert book['defaultBillingAddressId']==sid and book['defaultShippingAddressId']==bid
last=history('customer',email)['elements'][0];assert last['actor']==a['user']['id'] and last['actorLabel']=='Fixture Owner'
customer=call(p,h=h);customer_before=copy.deepcopy(customer)
edit={k:customer[k] for k in ['revision','profile','company','customerGroup','active']};edit['customerGroup']='vip';call(p,edit,h,'PUT')
assert call('/store-api/account/profile',h=ch,expected=401)
customer=call(p,h=h);current_history=history('customer',email)['elements'][0]
assert version('customer',email,current_history['id'])['after']['customerGroup']=='vip'
s=call('/api/merchant/commerce',h=h);s['data']['customerGroups']=[g for g in s['data']['customerGroups'] if g['id']!='vip'];call('/api/merchant/commerce',s,h,'PUT',400)
call('/api/history/customer/'+email+'/'+str(current_history['id'])+'/restore',{'approve':False,'revision':customer['revision'],'side':'before'},h,expected=400)
restore('customer',email,current_history['id'],customer['revision']-1,expected=409)
restore('customer',email,current_history['id'],customer['revision'])
restored=call(p,h=h);assert restored['customerGroup']=='consumer' and restored['addresses']['defaultBillingAddressId']==sid and restored['addresses']['defaultShippingAddressId']==bid
assert restored['revision']>customer['revision']
assert history('customer',email)['elements'][0]['reason'].startswith('restore:')
print('PASS independent address defaults, attributed aggregate history, protected custom group assignment and current-revision restore')
# Login uses preserved credentials; custom basis affects actual cart pricing, while group IDs remain exact.
customer=restored;edit={k:customer[k] for k in ['revision','profile','company','customerGroup','active']};edit['customerGroup']='vip';call(p,edit,h,'PUT')
guest=call('/store-api/checkout/cart',{},public);login=call('/store-api/account/login',{'email':email,'password':password},{**public,'sw-context-token':guest['token']});ch={**public,'x-customer-token':login['customerToken']}
cart=call('/store-api/checkout/cart',{},ch);cart_h={**ch,'sw-context-token':cart['token']}
product=call('/api/merchant/products/mug',h=h);product['commerce']['advancedPrices']=[{'rule_id':'vip','quantity_start':1,'quantity_end':None,'discount':.2},{'rule_id':'business','quantity_start':1,'quantity_end':None,'discount':.1}]
call('/api/merchant/products/mug',product,h,'PUT')
cart=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},cart_h)
assert cart['customerGroup']=='vip' and cart['price']['taxStatus']=='net'
assert abs(cart['lineItems'][0]['price']['unitPrice']-(product['commerce']['price']/1.19*.8))<.02,cart
# Real checkout keeps snapshots; subsequent group change invalidates open carts, not historical order ownership.
cart=call('/store-api/checkout/cart',h=cart_h)
selection={**cart['checkout'],'country':'DE','shippingMethodId':'pickup','paymentMethodId':cart['checkout']['paymentMethodId'],'customerEmail':email,'billingAddress':address,'address':address}
cart=call('/store-api/checkout/context',{'revision':cart['revision'],'checkout':selection},cart_h,'PUT')
order=call('/store-api/checkout/order',{}, {**cart_h,'Idempotency-Key':'history-checkout-'+suffix});oid=order['id']
assert call(p,h=h)['orders'][0]['id']==oid
customer=call(p,h=h);edit={k:customer[k] for k in ['revision','profile','company','customerGroup','active']};edit['customerGroup']='consumer';call(p,edit,h,'PUT')
assert call('/api/merchant/orders/'+oid,h=h)['customerEmail']==email
assert call(p,h=h)['orders'][0]['id']==oid
assert not history('order',oid)['canRestore'];restore('order',oid,history('order',oid)['elements'][0]['id'],order['revision'],expected=400)
# Product associations/translations constitute a single version; restoration never replenishes sold stock.
prod=call('/api/merchant/products/mug',h=h);old_price=prod['commerce']['price'];prod['commerce']['price']=old_price+3;prod['translations']['de']['name']='Historische Tasse';prod['extra']['shippingFree']=True
before_count=len(history('product','mug')['elements']);call('/api/merchant/products/mug',prod,h,'PUT');after=history('product','mug');assert len(after['elements'])==before_count+1
entry=after['elements'][0];snap=version('product','mug',entry['id']);assert snap['after']['record']['price']==old_price+3 and snap['before']['record']['price']==old_price
prod=call('/api/merchant/products/mug',h=h);prod['commerce']['stock']-=2;call('/api/merchant/products/mug',prod,h,'PUT');current=call('/api/merchant/products/mug',h=h);stock=current['commerce']['stock']
restore('product','mug',entry['id'],current['revision']);result=call('/api/merchant/products/mug',h=h)
assert result['commerce']['price']==old_price and result['commerce']['stock']==stock and result['revision']>current['revision']
restore('product','mug',entry['id'],current['revision'],expected=409)
print('PASS configured group net pricing/tier priority, immutable order/customer navigation and safe product rollback without inventory resurrection')
# Source rollback must re-enter review, never copy an old public approval.
doc=call('/api/knowledge/documents',{'title':'Original manual','content':'Original manual fixture.','productId':'mug','kind':'manual'},h);did=doc['id'];dp='/api/knowledge/documents/'+did
call(dp,{'revision':1,'visibility':'public','approve':True},h,'PUT')
call(dp,{'revision':2,'title':'Changed manual','content':'Changed instructions.','productId':'mug','kind':'manual'},h,'PATCH')
entry=history('source',did)['elements'][0];restore('source',did,entry['id'],3)
doc=call(dp,h=h);assert doc['title']=='Original manual' and doc['visibility']=='private' and doc['revision']==4
assert not call('/api/knowledge/preview',{'productId':'mug','query':'Original manual','audience':'customer'},h)['sources']
# Native and MCP histories use identical authorization and tenant fences.
assert not mcp('merchant.history',{'entity':'product','id':'mug'})['isError']
assert mcp('merchant.history.version',{'entity':'product','id':'mug','version':entry['id']})['isError']
call('/api/history/source/'+did+'/'+str(entry['id']),h=fh,expected=404)
assert call('/api/history/source/'+did,h=fh)['elements']==[]
inv=call('/api/workspace/invitations',{'email':'viewer'+suffix+'@example.test','role':'viewer'},h)
viewer=call('/api/auth/accept',{'invitationToken':inv['token'],'name':'Read-only','password':password});vh={**public,'Authorization':'Bearer '+viewer['token']}
assert not call('/api/history/product/mug',h=vh)['canRestore']
call('/api/history/product/mug/'+str(after['elements'][0]['id'])+'/restore',{'approve':True,'revision':result['revision'],'side':'before'},vh,expected=403)
assert mcp('merchant.history.restore',{'entity':'product','id':'mug','version':after['elements'][0]['id'],'revision':result['revision'],'side':'before','approve':True},vh)['isError']
assert not mcp('merchant.customer.groups',{},vh)['isError']
print('PASS private-first source restore, exact scoped versions, MCP parity and read-only/foreign-shop controls; paid provider calls: 0')
# Deleted addresses are recreated only within the owning customer's validated book.
b=call(p+'/addresses',h=h);removed=b['elements'][0];call(p+'/addresses/'+removed['id'],{'revision':removed['revision']},h,'DELETE')
e=history('customer',email)['elements'][0];c=call(p,h=h);restore('customer',email,e['id'],c['revision']);assert removed['id'] in [v['id'] for v in call(p+'/addresses',h=h)['elements']]
# All advertised editable domains restore through their normal admission and revisions.
names={'en':'History fixture','de':'Historie-Test','fr':'Historique test','es':'Historial prueba'}
channel={'name':names,'kind':'storefront','active':True,'locales':['en-GB','de-DE','fr-FR','es-ES'],'productIds':[],'navigationCategoryId':None}
rule={'name':names,'active':True,'condition':{'type':'alwaysValid'}}
flow={'name':names,'active':False,'event':'order.placed','condition':{'type':'alwaysValid'},'action':'note','instruction':names,'locale':'de-DE'}
promotion={'name':names,'active':False,'code':'HISTORY','kind':'absolute','amount':1,'rule':{'type':'alwaysValid'},'exclusive':False,'priority':0,'maxUses':None,'start':None,'end':None}
for entity,kind,data in [('channel','channels',channel),('rule','rules',rule),('flow','flows',flow),('promotion','promotions',promotion)]:
 path='/api/automation/'+kind+'/history_fixture';call(path,{'revision':0,'data':data},h,'PUT');changed=copy.deepcopy(data);changed['name']['en']='Changed';call(path,{'revision':1,'data':changed},h,'PUT');e=history(entity,'history_fixture')['elements'][0];restore(entity,'history_fixture',e['id'],2);row=next(x for x in call('/api/automation',h=h)[kind] if x['id']=='history_fixture');assert row['data']['name']['en']=='History fixture' and row['revision']==3
category={'active':True,'visible':True,'type':'page','translations':{l:{'name':'Original category','description':'','slug':'history-'+l} for l in ['en','de','fr','es']}}
c=call('/api/merchant/categories',{'revision':None,'parentId':'catalog-root','position':0,'data':category},h);cid=c['id'];changed=copy.deepcopy(category);changed['translations']['en']['name']='Changed';call('/api/merchant/categories/'+cid,{'revision':1,'parentId':'catalog-root','position':0,'data':changed},h,'PUT');restore('category',cid,history('category',cid)['elements'][0]['id'],2);assert next(x for x in call('/api/merchant/categories',h=h)['elements'] if x['id']==cid)['data']['translations']['en']['name']=='Original category'
company={'name':'Original Seller','street':'Fixture Road','houseNumber':'1','postalCode':'10115','city':'Berlin','country':'DE'}
path='/api/settings/master-data';call(path,{'revision':0,'data':company},h,'PUT');call(path,{'revision':1,'data':{**company,'name':'Changed Seller'}},h,'PUT');restore('company','base',history('company','base')['elements'][0]['id'],2);assert call(path,h=h)['data']['name']=='Original Seller'
path+='/channels/history_fixture';base=call('/api/settings/master-data',h=h)['revision'];call(path,{'revision':0,'baseRevision':base,'data':{'name':'Original Channel Seller'}},h,'PUT');call(path,{'revision':1,'baseRevision':base,'data':{'name':'Changed Channel Seller'}},h,'PUT');restore('companyChannel','history_fixture',history('companyChannel','history_fixture')['elements'][0]['id'],2);assert call(path,h=h)['effective']['name']=='Original Channel Seller'
path='/api/merchant/commerce/channels/history_fixture';s=call(path,h=h);s['data']['shipping'][0]['price']=2;call(path,s,h,'PUT');s=call(path,h=h);s['data']['shipping'][0]['price']=3;call(path,s,h,'PUT');restore('checkoutChannel','history_fixture',history('checkoutChannel','history_fixture')['elements'][0]['id'],2);assert call(path,h=h)['data']['shipping'][0]['price']==2
s=call('/api/merchant/commerce',h=h);old=copy.deepcopy(s['data']['customerGroups']);s['data']['customerGroups'][0]['translations']['en-GB']['name']='Changed group name';call('/api/merchant/commerce',s,h,'PUT');e=history('settings','base')['elements'][0];s=call('/api/merchant/commerce',h=h);restore('settings','base',e['id'],s['revision']);assert call('/api/merchant/commerce',h=h)['data']['customerGroups']==old
# Customer references already block removal; quantity prices and rule references also do so independently.
s=call('/api/merchant/commerce',h=h);s['data']['customerGroups']=[g for g in s['data']['customerGroups'] if g['id']!='vip'];assert call('/api/merchant/commerce',s,h,'PUT',400)['errors'][0]['detail']=='Customer group is assigned to advanced prices'
prod=call('/api/merchant/products/mug',h=h);prod['commerce']['advancedPrices']=[];call('/api/merchant/products/mug',prod,h,'PUT');call('/api/automation/rules/group_reference',{'revision':0,'data':{**rule,'condition':{'type':'customerGroup','values':['vip']}}},h,'PUT');assert call('/api/merchant/commerce',s,h,'PUT',400)['errors'][0]['detail']=='Customer group is used by a rule or flow'
print('PASS address recreation, all 12 editable entity restore types, inherited channel settings and independently enforced group dependencies')
# Recorded history cursors bound response size and do not overlap.
for i in range(32):
 s=call('/api/merchant/commerce',h=h);s['data']['customerGroups'][0]['translations']['en-GB']['name']='Consumer '+str(i);call('/api/merchant/commerce',s,h,'PUT')
first=history('settings','base');assert len(first['elements'])==30 and first['nextCursor']
second=call('/api/history/settings/base?before='+str(first['nextCursor']),h=h);assert not ({e['id'] for e in first['elements']}&{e['id'] for e in second['elements']})
print('PASS bounded cursor history with transaction-coalesced revisions')
