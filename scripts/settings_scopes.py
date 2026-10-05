#!/usr/bin/env python3
"""Real tenant/channel settings, immutable order dependencies, localized gallery and selective staging regressions."""
import copy,json,os,urllib.request,urllib.error,uuid
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8787');public={};merchant={}
def req(path,body=None,h=None,method=None,expected=200):
 r=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**public,**(h or {})},method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(r,timeout=30)as response:status=response.status;data=json.load(response)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 assert status==expected,(path,status,expected,data)
 return data
suffix=uuid.uuid4().hex[:10]
w=req('/api/auth/register',{'workspaceId':'scopes-'+suffix,'workspaceName':'Scope fixture','name':'Fixture owner','email':'scopes-'+suffix+'@example.test','password':'Synthetic-scope-2026!'})
public={'x-tenant':w['workspace']};merchant={**public,'Authorization':'Bearer '+w['token']}
channel={'name':{'en':'Channel fixture','de':'Kanal-Test','fr':'Canal test','es':'Canal de prueba'},'kind':'storefront','active':True,'locales':['en-GB','de-DE','fr-FR','es-ES'],'productIds':[],'navigationCategoryId':None}
req('/api/automation/channels/second',{'revision':0,'data':channel},merchant,'PUT')
p='/api/merchant/commerce/channels/second';record=req(p,h=merchant);assert record['revision']==0 and record['overrides']==[]
local=copy.deepcopy(record);m=next(m for m in local['data']['shipping'] if m['id']=='standard');m['price']=8;m['translations']['de']['name']='Kanalversand';tax=next(t for t in local['data']['taxes']if t['id']=='standard');tax['rates']['DE']=7.5
req(p,local,merchant,'PUT');req(p,local,merchant,'PUT',409)
base=req('/api/merchant/commerce',h=merchant);next(m for m in base['data']['shipping']if m['id']=='standard')['maxDays']=9;req('/api/merchant/commerce',base,merchant,'PUT')
effective=req(p,h=merchant);m=next(m for m in effective['data']['shipping']if m['id']=='standard');assert m['price']==8 and m['maxDays']==9 and m['translations']['de']['name']=='Kanalversand'
req(p,{**effective,'baseRevision':1},merchant,'PUT',409)
ch={**public,'sw-sales-channel-id':'second','x-commerce-locale':'de-DE'}
options=req('/store-api/checkout/options',h=ch);assert next(m for m in options['shipping']if m['id']=='standard')['name']=='Kanalversand'
assert req('/store-api/product/mug',h=ch)['product']['tax_rate']==7.5
assert req('/store-api/product/mug',h={**public,'x-commerce-locale':'de-DE'})['product']['tax_rate']==19
c=req('/store-api/checkout/cart',{'session':'scope-fixture'},ch);ch['sw-context-token']=c['token'];c=req('/store-api/checkout/cart/line-item',{'revision':c['revision'],'items':[{'id':'mug','quantity':1}]},ch)
ad={'name':'Fixture','street':'Synthetic 1','postalCode':'10115','city':'Test','country':'DE'}
c=req('/store-api/checkout/context',{'revision':c['revision'],'checkout':{**c['checkout'],'shippingMethodId':'standard','address':ad}},ch,'PUT');assert c['shippingCosts']['totalPrice']==8
order=req('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':'scope-order-'+suffix});assert order['cart']['shippingCosts']['totalPrice']==8
usage=req('/api/merchant/commerce/methods/shipping/standard/dependencies',h=merchant);assert usage['orders']==1 and not usage['canDelete'],usage
base=req('/api/merchant/commerce',h=merchant);deleted=copy.deepcopy(base);deleted['data']['shipping']=[m for m in deleted['data']['shipping']if m['id']!='standard'];req('/api/merchant/commerce',deleted,merchant,'PUT',409)
record=req(p,h=merchant);deleted=copy.deepcopy(record);deleted['data']['shipping']=[m for m in deleted['data']['shipping']if m['id']!='standard'];req(p,deleted,merchant,'PUT',409)
next(m for m in record['data']['shipping']if m['id']=='standard')['active']=False;req(p,record,merchant,'PUT');assert all(m['id']!='standard'for m in req('/store-api/checkout/options',h=ch)['shipping'])
assert req('/api/merchant/orders/'+order['id'],h=merchant)['cart']['shippingCosts']['totalPrice']==8
print('PASS field inheritance, localized channel methods, native PDP/cart/order prices, stale writes and dependency-safe deactivation')
# Creation/removal of an unreferenced method and Rule Builder method dependency.
base=req('/api/merchant/commerce',h=merchant);extra=copy.deepcopy(base['data']['shipping'][0]);extra.update(id='fixture-new',name='Fixture shipping',translations={'en':{'name':'Fixture shipping'}});base['data']['shipping'].append(extra);req('/api/merchant/commerce',base,merchant,'PUT')
usage=req('/api/merchant/commerce/methods/shipping/fixture-new/dependencies',h=merchant);assert usage['canDelete']
removed=req('/api/merchant/commerce',h=merchant);removed['data']['shipping']=[m for m in removed['data']['shipping']if m['id']!='fixture-new'];req('/api/merchant/commerce',removed,merchant,'PUT')
base=req('/api/merchant/commerce',h=merchant);base['data']['shipping'].append(extra);req('/api/merchant/commerce',base,merchant,'PUT')
req('/api/automation/rules/method_ref',{'revision':0,'data':{'name':{'en':'Method fixture'},'active':True,'condition':{'type':'shopwareCondition','name':'shippingMethod','config':{'operator':'=','shippingMethodIds':['fixture-new']}}}},merchant,'PUT')
usage=req('/api/merchant/commerce/methods/shipping/fixture-new/dependencies',h=merchant);assert usage['rules']==1 and not usage['canDelete'],usage
base=req('/api/merchant/commerce',h=merchant);base['data']['shipping']=[m for m in base['data']['shipping']if m['id']!='fixture-new'];req('/api/merchant/commerce',base,merchant,'PUT',409)
# Shared translation fallback for image metadata never materializes a second-language value in the editor.
pd=req('/api/merchant/products/mug',h=merchant);pd['commerce']['media'][0]['alt']={'en':'Main image','de':None,'es':''};req('/api/merchant/products/mug',pd,merchant,'PUT')
assert req('/store-api/product/mug',h={**public,'x-commerce-locale':'de-DE'})['product']['media'][0]['view']=='Main image'
assert req('/store-api/product/mug',h={**public,'x-commerce-locale':'es-ES'})['product']['media'][0]['view']==''
pd=req('/api/merchant/products/mug',h=merchant);assert pd['commerce']['media'][0]['alt']['de'] is None
invalid=copy.deepcopy(pd);invalid['commerce']['media'][0]['alt']['ja']='Invalid';req('/api/merchant/products/mug',invalid,merchant,'PUT',400)
# Clone preserves scoped settings; publishing one channel unit leaves shared basis untouched.
env=req('/api/environments',{'name':'Scope sandbox'},merchant);stage=env['id'];sh={**merchant,'x-tenant':stage};st=req(p,h=sh);next(m for m in st['data']['shipping']if m['id']=='standard')['price']=11;req(p,st,sh,'PUT')
diff=req('/api/environments/'+stage+'/diff',h=merchant);unit=next(u for u in diff['changes']if u['key']=='settings-channel:second');req('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':unit['key'],'digest':unit['digest']}]},merchant)
assert next(m for m in req(p,h=merchant)['data']['shipping']if m['id']=='standard')['price']==11
assert next(m for m in req('/api/merchant/commerce',h=merchant)['data']['shipping']if m['id']=='standard')['price']==4.9
m=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'merchant.commerce.read','arguments':{'channelId':'second'}}},merchant);assert not m['result']['isError'] and m['result']['structuredContent']['channelId']=='second'
other=req('/api/auth/register',{'workspaceId':'scope-other-'+suffix,'workspaceName':'Other','name':'Other fixture','email':'scope-other-'+suffix+'@example.test','password':'Synthetic-scope-2026!'})
req(p,h={**merchant,'x-tenant':other['workspace']},expected=403)
print('PASS rule references, translated media inheritance, channel staging/publish, native MCP and tenant isolation')
