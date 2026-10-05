#!/usr/bin/env python3
"""Native App Studio exercised through real HTTP/PostgreSQL: shared IR, version isolation, data, routes, MCP and selective release."""
import copy,json,os,pathlib,time,urllib.request,urllib.error,uuid
base=os.getenv('BASE_URL','http://127.0.0.1:8787');checks=[]
def call(path,body=None,session=None,tenant=None,expected=200,method=None):
 h={'Content-Type':'application/json','x-commerce-locale':'de-DE'}
 if session:h.update({'Authorization':'Bearer '+session['token'],'x-tenant':tenant or session['workspace']})
 elif tenant:h['x-tenant']=tenant
 r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=h,method=method)
 try:
  with urllib.request.urlopen(r,timeout=30) as out:status=out.status;value=json.load(out)
 except urllib.error.HTTPError as e:status=e.code;value=json.load(e)
 assert status==expected,(path,status,expected,value)
 return value
def account():
 u=uuid.uuid4().hex[:12]
 return call('/api/auth/register',{'email':u+'@example.test','name':'App Studio fixture','password':'Synthetic-app-studio-2026!','workspaceId':'appstudio-'+u,'workspaceName':'App Studio isolated'})
def passed(text):checks.append(text);print('PASS',text)
a=account();other=account()
conf=call('/api/merchant/commerce',session=a);s=conf['data'];s['mainLocale']='es-ES';s['locales'].append('it-IT')
call('/api/merchant/commerce',{'data':s,'revision':conf['revision']},a,method='PUT')
schema=call('/api/developer/schema',session=a);label=schema['properties']['manifest']['properties']['views']['items']['properties']['blocks']['items']['properties']['title']
assert 'it-IT' in label['required'] and label['additionalProperties'] is False
stage=call('/api/environments',{'name':'Native App Studio'},a)['id']
m=json.loads((pathlib.Path(__file__).resolve().parents[1]/'extensions/apps/care-studio/manifest.json').read_text())
m['id']='studio_'+uuid.uuid4().hex[:8]
def save(manifest,expected=200):return call('/api/developer/import',{'environment':stage,'prompt':'Native care app','summary':manifest['name'],'manifest':manifest},a,expected=expected)
b=save(m);assert b['manifest']['views'] and b['digest'];save(m,409)
task=call('/api/developer/task',{'environment':stage,'prompt':'Extend the same app','manifest':m,'agent':'codex'},a)
assert task['currentManifest']==m and 'it-IT' in task['appSchema']['properties']['summary']['required'] and a['token'] not in json.dumps(task)
passed('Visual and agent builds share native Manifest IR; schema uses actual languages, immutable versions and no credential export')
for mutation in ['write','entity','allowlist','html','script']:
 bad=copy.deepcopy(m);bad['version']='1.0.1'
 if mutation=='write':bad['views'][1]['blocks'][0]={'id':'bad','kind':'form','title':m['name'],'entity':'guides','readAction':'list_guides','writeAction':'save_guides'}
 elif mutation=='entity':bad['views'][0]['blocks'][0]['entity']='unknown'
 elif mutation=='allowlist':bad['surfaces'][0]['actions']=[]
 elif mutation=='html':bad['views'][0]['blocks'][0]['html']='<script>bad</script>'
 else:bad['views'][0]['blocks'][0]['kind']='javascript'
 save(bad,400)
call('/api/developer/builds/'+b['id']+'/stage',{'approve':True,'digest':b['digest']},a)
private=call('/api/apps/surfaces',session=a,tenant=stage)['surfaces'];assert next(v for v in private if v['app']==m['id'])['native']['view']['id']=='workspace'
public=call('/store-api/apps/surfaces',session=a,tenant=stage)['surfaces'];v=next(v for v in public if v['app']==m['id']);assert v['mainLocale']=='es-ES' and 'it-IT' in v['locales'] and all(b['kind']!='form' for b in v['native']['view']['blocks'])
call('/store-api/apps/surfaces',tenant=stage,expected=401)
passed('Native admin/shop registries resolve installed definitions and reject public forms, wrong bindings, unlisted actions and code injection')
fields={'title':{'es':'Origen'},'instructions':{'es':'Contenido original','de':None,'it-IT':'Istruzioni'}}
call('/api/apps/'+m['id']+'/actions/save_guides',{'id':'care','revision':0,'fields':fields},a,stage)
record=call('/store-api/apps/'+m['id']+'/http/guides?limit=1',session=a,tenant=stage)['elements'][0];assert record['title']=={'es':'Origen'} and record['instructions']['de'] is None and record['revision']==1
call('/api/apps/'+m['id']+'/actions/save_guides',{'id':'care','revision':0,'fields':fields},a,stage,409)
invalid=copy.deepcopy(fields);invalid['title']={'de':'Missing main'}
call('/api/apps/'+m['id']+'/actions/save_guides',{'id':'invalid','revision':0,'fields':invalid},a,stage,400)
invalid=copy.deepcopy(fields);invalid['instructions']={'ja-JP':'Not enabled'}
call('/api/apps/'+m['id']+'/actions/save_guides',{'id':'invalid','revision':0,'fields':invalid},a,stage,400)
call('/store-api/apps/'+m['id']+'/actions/save_guides',{'id':'attack','revision':0,'fields':fields},tenant=stage,expected=401)
call('/api/apps/'+m['id']+'/http/guides',{'id':'other','fields':fields},other,stage,403)
tools=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},a,stage)['result']['tools'];assert any(t['name']=='app.'+m['id']+'.list_guides' for t in tools)
passed('Real typed app records, dynamic translations/main inheritance, keyset API and MCP work; stale writes, disabled languages and cross-shop reads fail')
change=next(c for c in call('/api/environments/'+stage+'/diff',session=a)['changes'] if c['key']=='app:'+m['id'])
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':change['key'],'digest':change['digest']}]},a)
assert call('/store-api/apps/'+m['id']+'/http/guides',tenant=a['workspace'])['elements']==[]
assert next(s for s in call('/store-api/apps/surfaces',tenant=a['workspace'])['surfaces'] if s['app']==m['id'])['native']
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':change['key'],'digest':change['digest']}]},a,expected=409)
call('/store-api/apps/'+m['id']+'/actions/save_guides',{'id':'attack','revision':0,'fields':fields},tenant=a['workspace'],expected=401)
passed('Selected package release activates real native surfaces/API, leaves test records private and rejects stale release replay/public writes')
flow={'name':m['name'],'active':True,'event':'order.placed','condition':{'type':'alwaysValid'},'action':'app_action','instruction':m['name'],'locale':'es-ES','appAction':{'app':m['id'],'action':'save_guides','arguments':{'id':'from_flow','revision':0,'fields':{'title':{'es':'Creado por evento'}}}}}
call('/api/automation/flows/native_app_event',{'revision':0,'data':flow},a,method='PUT')
cart=call('/store-api/checkout/cart',{'session':'studio-'+uuid.uuid4().hex},tenant=a['workspace'])
# Checkout context is bound to the cart token; no external payment is made.
def checkout(path,body,method=None):
 headers={'Content-Type':'application/json','x-tenant':a['workspace'],'sw-context-token':cart['token'],'Idempotency-Key':'studio-order-'+m['id']}
 request=urllib.request.Request(base+path,data=json.dumps(body).encode(),headers=headers,method=method)
 with urllib.request.urlopen(request,timeout=30) as out:return json.load(out)
cart=checkout('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]})
address={'name':'Synthetic Buyer','firstName':'Synthetic','lastName':'Buyer','street':'Fixture Street 1','postalCode':'10115','city':'Fixture city','country':'DE'}
cart=checkout('/store-api/checkout/context',{'revision':cart['revision'],'checkout':{'country':'DE','shippingMethodId':'pickup','paymentMethodId':'bank-transfer','address':address,'billingAddress':address,'customerEmail':'fixture@example.test'}},'PUT')
checkout('/store-api/checkout/order',{})
for _ in range(100):
 jobs=call('/api/automation',session=a)['jobs']
 if any(j['flow']=='native_app_event' and j['state']=='completed' for j in jobs):break
 time.sleep(.1)
else:raise AssertionError(('Native flow failed',jobs))
assert next(r for r in call('/api/apps/'+m['id']+'/actions/list_guides',{},a)['elements'] if r['id']=='from_flow')['title']['es']=='Creado por evento'
passed('Committed core order event executes a permitted native app save through the existing durable Flow Builder')
print(json.dumps({'passed':len(checks),'checks':checks,'paidInference':False},indent=2))
