#!/usr/bin/env python3
"""Tenant-bound default configuration, revision-safe deletion and actual event-flow effects."""
import json, os, time, uuid, urllib.request, urllib.error
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787'); suffix=uuid.uuid4().hex[:10]
def call(path, body=None, h=None, method=None, expected=200):
    req=urllib.request.Request(BASE+path, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type':'application/json',**(h or {})},method=method)
    try:
        with urllib.request.urlopen(req,timeout=30) as r: status=r.status; value=json.load(r)
    except urllib.error.HTTPError as e: status=e.code; value=json.load(e)
    assert status==expected,(path,status,expected,value)
    return value
def register(label):
    return call('/api/auth/register',{'workspaceId':label+'-'+suffix,'workspaceName':label,'name':'Owner','email':label+suffix+'@example.test','password':'Synthetic-lifecycle-2026!'})
a=register('lifecycle'); b=register('lifeforeign')
h={'x-tenant':a['workspace'],'Authorization':'Bearer '+a['token']}
foreign={'x-tenant':a['workspace'],'Authorization':'Bearer '+b['token']}
def definitions(): return call('/api/automation',h=h)
def item(kind,id): return next(r for r in definitions()[kind] if r['id']==id)
def save(kind,id,data,revision=0): return call('/api/automation/'+kind+'/'+id,{'revision':revision,'data':data},h,'PUT')
names={'en-GB':'Test lifecycle','de-DE':'Lebenszyklus-Test','es-ES':'Prueba de ciclo','fr-FR':'Test de cycle'}
call('/store-api/product',{}, {'x-tenant':a['workspace'],'x-commerce-locale':'de-CH'})
d=definitions(); assert any(c['id']=='default' for c in d['channels']), 'Default channel must be a persisted, editable record'
assert len(d['rules'])>=3 and len(d['flows'])>=2
assert not d['promotions'], 'Provisioning must not create commercial discounts'
print('PASS new shops contain an editable default channel and safe translated starter processes',flush=True)
channel=item('channels','default'); edited={**channel['data'],'name':names}
save('channels','default',edited,channel['revision'])
call('/api/automation/channels/default',{'revision':channel['revision']},h,'DELETE',409)
assert item('channels','default')['data']['name']==names
call('/api/automation/channels/default',{'revision':channel['revision']+1},h,'DELETE',409)
call('/api/automation/channels/default',{'revision':channel['revision']+1,'data':{**edited,'active':False}},h,'PUT')
call('/api/automation/channels/default',{'revision':channel['revision']+2,'data':{**edited,'active':True}},h,'PUT')
bh={'x-tenant':b['workspace'],'Authorization':'Bearer '+b['token']}
rule={'name':names,'active':True,'condition':{'type':'alwaysValid'}}
save('rules','test_target',rule)
call('/api/automation/rules/test_target/dependencies',h=bh,expected=404)
call('/api/automation/rules/test_target',{'revision':1},bh,'DELETE',404)
assert item('rules','test_target')['revision']==1
call('/api/automation/rules/cyclic',{'revision':0,'data':{**rule,'condition':{'type':'ruleReference','ruleId':'cyclic'}}},h,'PUT',400)
call('/api/automation/rules/foreign_reference',{'revision':0,'data':{**rule,'condition':{'type':'ruleReference','ruleId':'absent'}}},h,'PUT',400)
flow={**item('flows','default_order_received')['data'],'condition':{'type':'ruleReference','ruleId':'test_target'}}
save('flows','test_flow',flow)
dep=call('/api/automation/rules/test_target/dependencies',h=h); assert dep['blocked'] and any(x['id']=='test_flow' for x in dep['dependencies'])
call('/api/automation/rules/test_target',{'revision':1},h,'DELETE',409)
for path,body,method in [('/api/automation/rules/test_target/dependencies',None,None),('/api/automation/flows/test_flow',{'revision':1},'DELETE')]:
    call(path,body,foreign,method,403)
assert item('flows','test_flow')['revision']==1
call('/api/automation/flows/test_flow',{'revision':0},h,'DELETE',409)
call('/api/automation/flows/test_flow',{'revision':1},h,'DELETE')
call('/api/automation/flows/test_flow',{'revision':1},h,'DELETE',404)
call('/api/automation/rules/test_target',{'revision':1},h,'DELETE')
call('/api/automation/rules/missing/dependencies',h=h,expected=404)
print('PASS dependency checks, foreign tenant denial, stale revisions and default-channel protection',flush=True)
save('rules','test_unused',rule)
m=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'automation.delete','arguments':{'kind':'rules','id':'test_unused','revision':1}}},h)
assert not m['result'].get('isError'),m
assert not any(r['id']=='test_unused' for r in definitions()['rules'])
p={'x-tenant':a['workspace']}; cart=call('/store-api/checkout/cart',{},p); ph={**p,'sw-context-token':cart['token']}
cart=call('/store-api/checkout/cart',{'revision':cart['revision'],'items':[{'id':'mug','quantity':1}]},ph,'PUT')
order=call('/store-api/checkout/order',{}, {**ph,'Idempotency-Key':'lifecycle-'+suffix})
for _ in range(150):
    jobs=call('/api/automation/executions',h=h)['jobs']
    if any(j['flow']=='default_order_received' and j['state']=='completed' for j in jobs): break
    time.sleep(.1)
else: raise AssertionError(jobs)
assert order['salesChannelId']=='default'
promo={'name':names,'active':True,'code':'LIFE10','kind':'percentage','amount':10,'rule':{'type':'alwaysValid'},'exclusive':False,'priority':0,'maxUses':None,'start':None,'end':None}
save('promotions','test_coupon',promo)
cart=call('/store-api/checkout/cart',{},p); ph={**p,'sw-context-token':cart['token']}
cart=call('/store-api/checkout/cart',{'revision':cart['revision'],'items':[{'id':'notebook','quantity':1}]},ph,'PUT')
cart=call('/store-api/checkout/coupons',{'revision':cart['revision'],'codes':['LIFE10']},ph,'PUT')
call('/store-api/checkout/order',{}, {**ph,'Idempotency-Key':'coupon-life-'+suffix})
assert call('/api/automation/promotions/test_coupon/dependencies',h=h)['blocked']
call('/api/automation/promotions/test_coupon',{'revision':1},h,'DELETE',409)
save('promotions','test_coupon',{**promo,'active':False},1)
unused={**channel['data'],'name':names}
save('channels','test_channel',unused)
call('/api/automation/channels/test_channel',{'revision':1},h,'DELETE')
save('channels','used_channel',unused)
call('/store-api/checkout/cart',{}, {**p,'sw-sales-channel-id':'used_channel'})
assert call('/api/automation/channels/used_channel/dependencies',h=h)['blocked']
call('/api/automation/channels/used_channel',{'revision':1},h,'DELETE',409)
print('PASS redeemed coupons and used channels preserve history; unused channels can be deleted',flush=True)
print('PASS MCP uses the same lifecycle and real checkout executes the default order flow',flush=True)
