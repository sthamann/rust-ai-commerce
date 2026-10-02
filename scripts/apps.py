#!/usr/bin/env python3
"""Real PostgreSQL app lifecycle, managed schema/RLS, typed API/MCP, cart and observation tests."""
import copy,json,os,pathlib,time,urllib.request,urllib.error,uuid,hashlib,subprocess
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787');ROOT=pathlib.Path(__file__).resolve().parents[1];checks=[]
def call(path,body=None,h=None,method=None,expected=200):
    req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
    except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
    assert code==expected,(path,code,v,expected);return v
def check(name):checks.append(name);print('PASS',name)
def user():return call('/api/auth/register',{'email':uuid.uuid4().hex+'@example.test','name':'App Contract Owner','password':'Synthetic-app-account-2026!','workspaceId':'apps-'+uuid.uuid4().hex[:12],'workspaceName':'App contract shop'})
u=user();other=user();h={'Authorization':'Bearer '+u['token'],'x-tenant':u['workspace']};oh={'Authorization':'Bearer '+other['token'],'x-tenant':other['workspace']}
call('/api/apps',{'builtIn':'engraving'},h);check('Built-in installation creates actual typed app tables')
rows=call('/api/apps/engraving/entities/rules',h=h)['elements'];assert rows==[{'id':'default','revision':1,'fee_minor':300}]
call('/api/apps/engraving/entities/rules',{'id':'default','revision':1,'fields':{'fee_minor':'300'}},h,expected=400)
call('/api/apps/engraving/entities/rules',{'id':'default','revision':1,'fields':{'fee_minor':300,'tenant':other['workspace']}},h,expected=400)
call('/api/apps/engraving/entities/rules',h=oh,expected=404);check('Typed writes and independent workspace installations enforce data boundaries')
call('/api/apps',{'builtIn':'engraving'},oh);assert call('/api/apps/engraving/entities/rules',h=oh)['elements'][0]['fee_minor']==300
call('/api/apps/engraving/entities/rules',{'id':'default','revision':1,'fields':{'fee_minor':500}},h)
assert call('/api/apps/engraving/entities/rules',h=oh)['elements'][0]['fee_minor']==300
call('/api/apps/engraving/entities/rules',{'id':'default','revision':1,'fields':{'fee_minor':200}},h,expected=409);check('App optimistic updates never alter another shop')
call('/api/apps/engraving/entities/rules',{'id':'default','revision':2,'fields':{'fee_minor':-1}},h,expected=400)
table='app_'+hashlib.sha256(b'engraving').hexdigest()[:16]+'_rules';role='test_rls_'+uuid.uuid4().hex[:12]
# Local database bootstrap identity is a superuser; SET LOCAL ROLE proves the policy under a restricted identity.
query=f"BEGIN; CREATE ROLE {role}; GRANT SELECT ON {table} TO {role}; SELECT set_config('rac.tenant','{u['workspace']}',true); SET LOCAL ROLE {role}; SELECT count(*) FROM {table} WHERE tenant <> '{u['workspace']}'; SELECT count(*) FROM {table} WHERE tenant = '{u['workspace']}'; ROLLBACK;"
output=subprocess.check_output(['docker','exec','rust-ai-commerce-postgres-1','psql','-U','commerce','-d','commerce','-Atq','-c',query],text=True).splitlines()
assert output[-2:]==['0','1'],output
check('Forced app RLS filters another tenant even when SQL omits an application tenant predicate')

tools=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},h)['result']['tools'];assert any(t['name']=='app.engraving.rules' for t in tools)
assert not any(t['name'].startswith('app.') for t in call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},{'x-tenant':u['workspace']})['result']['tools'])
record=call('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'app.engraving.rules','arguments':{}}},h)['result']['structuredContent'];assert record['elements'][0]['fee_minor']==500;check('HTTP and authorized MCP consume the same app capability')
ch={'x-tenant':u['workspace']};c=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},ch);ch['sw-context-token']=c['token']
c=call('/store-api/apps/engraving/configure',{'productId':'mug','fields':{'text':'Ada'},'revision':c['revision']},ch)
c=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':2},{'referencedId':'notebook','quantity':1}]},ch)
mug=next(i for i in c['lineItems'] if i['id']=='mug');assert mug['price']['unitPrice']==29.9 and mug['configuration']['fields']['text']=='Ada'
assert abs(c['price']['totalPrice']-72.3)<1e-8;check('Configuration adds server-derived taxed fee to the actual cart')
call('/api/apps/engraving/entities/rules',{'id':'default','revision':2,'fields':{'fee_minor':700}},h)
call('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':uuid.uuid4().hex},expected=409)
c=call('/store-api/apps/engraving/configure',{'productId':'mug','fields':{'text':'Ada'},'revision':c['revision']},ch)
order_key=uuid.uuid4().hex
o=call('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':order_key});assert next(i for i in o['cart']['lineItems'] if i['id']=='mug')['configuration']['feeMinor']==700
assert call('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':order_key})['id']==o['id']
assert call('/api/apps/engraving/actions/orders',{},h)['elements'][0]['orderId']==o['id'];check('Stale fees reject checkout; confirmed configuration persists in the merchant order')
for _ in range(60):
    memory=call('/api/intelligence',h=h)
    if memory['pairs']:break
    time.sleep(.25)
assert memory['pairs'][0]['orders']==1 and memory['pairs'][0]['simulatedOrders']==1
graph=call('/api/knowledge',h=h);assert graph['observedPairs'][0]['source']=='order-observation'
assert not memory['modelWeightsUpdated'] and not memory['causalUpliftProven'];check('Order event creates durable graph association with exact evidence and no causal claim')
idea=memory['hypotheses'][0];decision=call('/api/intelligence/hypotheses/'+idea['id'],{'state':'experiment','revision':idea['revision'],'approve':True},h,'PUT');assert not decision['experimentStarted']
call('/api/intelligence/hypotheses/'+idea['id'],{'state':'dismissed','revision':idea['revision'],'approve':True},h,'PUT',409);check('Hypothesis review records a decision without inventing an experiment')
assert call('/store-api/intelligence/recommendations/mug',h=ch)['elements']==[]
idea=call('/api/intelligence',h=h)['hypotheses'][0];call('/api/intelligence/hypotheses/'+idea['id'],{'state':'published','revision':idea['revision'],'approve':True},h,'PUT')
public=call('/store-api/intelligence/recommendations/mug',h=ch);assert public['elements'][0]['id']=='notebook' and 'orders' not in json.dumps(public)
assert call('/store-api/intelligence/recommendations/mug',h={'x-tenant':other['workspace']})['elements']==[];check('Approved association reaches a real public storefront consumer without leaking order evidence')
manifest=json.loads((ROOT/'extensions/apps/service-example/manifest.json').read_text());call('/api/apps',{'manifest':manifest},h)
call('/api/apps/workshop_notes/entities/notes',{'id':'n1','fields':{'title':'Example note'}},h)
call('/api/apps/workshop_notes/entities/tickets',{'id':'t1','fields':{'note_id':'n1','title':'Finish order'}},h)
changed=copy.deepcopy(manifest);changed['version']='1.1.0';changed['entities'][0]['fields'].append({'name':'label','kind':'string','required':False,'indexed':True});call('/api/apps',{'manifest':changed},h)
assert call('/api/apps/workshop_notes/entities/notes',h=h)['elements'][0]['title']=='Example note'
call('/api/apps',{'manifest':manifest},oh)
assert call('/api/apps/workshop_notes/entities/notes',h=oh)['elements']==[]
call('/api/apps',{'manifest':manifest},h,expected=409)
bad=copy.deepcopy(changed);bad['id']='x;drop';call('/api/apps',{'manifest':bad},h,expected=400)
bad=copy.deepcopy(changed);bad['entities'][0]['fields'][0]['kind']='integer';call('/api/apps',{'manifest':bad},h,expected=409);check('Custom app entities/relationships and additive upgrades preserve data; unsafe schema changes fail')
inv=call('/api/workspace/invitations',{'email':uuid.uuid4().hex+'@example.test','role':'viewer'},h)
reader=call('/api/auth/accept',{'invitationToken':inv['token'],'name':'App Reader','password':'Synthetic-app-account-2026!'})
rh={'Authorization':'Bearer '+reader['token'],'x-tenant':u['workspace']}
assert call('/api/apps/engraving/actions/rules',{},rh)['elements']
call('/api/apps/engraving/actions/save_rules',{'id':'default','revision':3,'fields':{'fee_minor':100}},rh,expected=403)
call('/api/apps',{'builtIn':'paypal'},rh,expected=403);check('Read-only members can query apps but cannot install or change their data')
pack=next(p for p in call('/api/apps',h=h)['packages'] if p['id']=='engraving')
call('/api/apps/engraving',{'active':False,'revision':pack['revision']},h,'PUT')
call('/api/apps/engraving/actions/rules',{},h,expected=409)
call('/api/apps/engraving',{'active':True,'revision':pack['revision']+1},h,'PUT')
assert call('/api/apps/engraving/entities/rules',h=h)['elements'][0]['fee_minor']==700;check('Deactivation removes capabilities while retaining app data')
# A second independently packaged module has different business rules; core has no app branch.
gift=json.loads((ROOT/'extensions/apps/gift-message/manifest.json').read_text())
call('/api/apps',{'manifest':gift},h)
call('/api/apps/gift_message/entities/rules',{'id':'default','revision':1,'fields':{'fee_minor':501}},h,expected=400)
c=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},{'x-tenant':u['workspace']})
ch2={'x-tenant':u['workspace'],'sw-context-token':c['token']}
call('/store-api/apps/gift_message/configure',{'productId':'mug','fields':{'message':'too long input'},'revision':c['revision']},ch2,expected=400)
call('/store-api/apps/gift_message/configure',{'productId':'mug','fields':{'message':'Ada','tenant':'other'},'revision':c['revision']},ch2,expected=400)
c=call('/store-api/apps/gift_message/configure',{'productId':'mug','fields':{'message':'Ada'},'revision':c['revision']},ch2)
c=call('/store-api/apps/engraving/configure',{'productId':'mug','fields':{'text':'Ada'},'revision':c['revision']},ch2)
c=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':2}]},ch2)
assert c['lineItems'][0]['price']['unitPrice']==33.4 and len(c['lineItems'][0]['appConfigurations'])==2
key2=uuid.uuid4().hex
o2=call('/store-api/checkout/order',{}, {**ch2,'Idempotency-Key':key2})
assert o2['cart']['lineItems'][0]['price']['totalPrice']==66.8
assert call('/api/apps/gift_message/actions/orders',{},h)['elements'][0]['orderId']==o2['id']
check('Independent app-owned Wasm rules and fields compose on one SKU with real taxed checkout')
broken=copy.deepcopy(gift);broken['id']='broken_config';broken['configuration']['wasmSource']='(module)'
call('/api/apps',{'manifest':broken},h,expected=400)
assert not any(p['id']=='broken_config' for p in call('/api/apps',h=h)['packages'])
check('Missing app ABI rejects installation before publishing a package or creating schema')
state={'owner':u,'orderId':o['id'],'memory':memory,'checks':checks,'passed':len(checks)}
if os.getenv('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(state,indent=2)+'\n')
print(json.dumps({'passed':len(checks)}))
