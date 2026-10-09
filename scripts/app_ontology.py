#!/usr/bin/env python3
"""Real native graph mapping contract through two-tenant API, MCP, permissions, references and revisions."""
import copy,json,os,urllib.request,urllib.error,uuid
from testing.app_approval import consent
from testing.runtime import ROOT
base=os.environ['BASE_URL']
def call(path,body=None,h=None,method=None,status=200):
 if path=='/api/apps' and body and 'manifest' in body:body=consent(body)
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(path,code,status,v);return v

def owner():
 t='ontology-'+uuid.uuid4().hex[:12]
 u=call('/api/auth/register',{'workspaceId':t,'name':'Ontology fixture','email':t+'@example.test','password':'Synthetic-ontology-2026!'})
 return {'Authorization':'Bearer '+u['token'],'x-tenant':t}
h=owner();oh=owner()
for headers in [h,oh]:
 conf=call('/api/merchant/commerce',h=headers);conf['data']['locales'].append('it-IT');call('/api/merchant/commerce',{'data':conf['data'],'revision':conf['revision']},headers,method='PUT')
m=json.loads((ROOT/'extensions/apps/ontology-care/manifest.json').read_text())
# Public native reference is an explicit choice; a private field remains outside the selected graph.
m['entities'][0]['fields'].append({'name':'internal','kind':'string'})
for headers in [h,oh]:call('/api/apps',{'manifest':m},headers)
path='/api/apps/ontology_care/entities/guides'
def save(headers,text,revision=0):
 return call(path,{'id':'same','revision':revision,'fields':{'product_id':'mug','title':{'en':text,'it-IT':'Cura italiana'},'instructions':{'en':'Hand wash'},'internal':'not-selected'}},headers)
save(h,'Own care');save(oh,'Foreign care')
g=call(path,h=h)['ontology'];foreign=call(path,h=oh)['ontology']
assert g['tenant']==h['x-tenant'] and foreign['tenant']==oh['x-tenant']
assert g['nodes'][0]['properties']['title']['en']=='Own care' and foreign['nodes'][0]['properties']['title']['en']=='Foreign care'
assert 'internal' not in g['nodes'][0]['properties'] and g['nodes'][0]['source']['revision']==1
assert g['nodes'][0]['properties']['title']['it-IT']=='Cura italiana'
assert g['edges'][0]['type']=='app.ontology_care.applies_to' and g['edges'][0]['targetType']=='product' and g['edges'][0]['targetId']=='mug'
assert g['assurance']=='native-app-records-not-confirmed-product-claims'
rpc={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'app.ontology_care.list_guides','arguments':{}}}
assert call('/mcp',rpc,h)['result']['structuredContent']['ontology']==g
save(h,'Current care',1)
current=call('/mcp',rpc,h)['result']['structuredContent']['ontology'];assert current['nodes'][0]['source']['revision']==2 and current['nodes'][0]['properties']['title']['en']=='Current care'
call(path,{'id':'same','revision':1,'fields':{'product_id':'mug','title':{'en':'Stale'}}},h,status=409)
assert call(path,h=oh)['ontology']==foreign
print('PASS API and MCP derive current namespaced graph nodes/edges from tenant-owned native records; fields and revisions remain exact')
# Native foreign keys remain authoritative, including references to other app models.
private=copy.deepcopy(m);private['id']='private_ontology';private['surfaces']=[];private['views']=[];private['apiRoutes']=[]
private['entities'][0]['publicRead']=False
for a in private['actions']:a['public']=False;a['permission']='apps.manage'
private['entities'].append({'name':'notes','fields':[{'name':'body','kind':'string'},{'name':'guides','kind':'relations','references':'guides'}]})
private['actions'].extend([{'name':'list_notes','description':'List notes','handler':'list','entity':'notes','permission':'apps.manage','inputSchema':{'type':'object','properties':{},'additionalProperties':False}}, {'name':'save_notes','description':'Save note','handler':'save','entity':'notes','permission':'apps.manage','inputSchema':{'type':'object','properties':{'id':{'type':'string'},'fields':{'type':'object'}},'required':['id','fields'],'additionalProperties':False}}])
private['intelligence']['entities'].append('notes');private['intelligence']['tools'].append('list_notes');private['intelligence']['ontology'].append({'entity':'notes','nodeType':'care_note','label':m['name'],'fields':['guides','body'],'relations':{'guides':'explains'}})
call('/api/apps',{'manifest':private},h)
p='/api/apps/private_ontology/entities/'
call(p+'guides',{'id':'g1','fields':{'product_id':'mug','title':{'en':'Guide'}}},h)
call(p+'notes',{'id':'n1','fields':{'body':'Native note','guides':['g1']}},h)
edge=call(p+'notes',h=h)['ontology']['edges'][0];assert edge['type']=='app.private_ontology.explains' and edge['targetType']=='app.private_ontology.care_advice' and edge['targetId']=='g1'
call(p+'notes',{'id':'bad','fields':{'body':'Missing','guides':['foreign']}},h,status=409)
# An unrelated tenant cannot acquire private tools by changing the tenant header or identifiers.
call(p+'notes',h=oh,status=404)
call(p+'notes',h={**oh,'x-tenant':h['x-tenant']},status=403)
inv=call('/api/workspace/invitations',{'email':uuid.uuid4().hex+'@example.test','role':'viewer'},h)
r=call('/api/auth/accept',{'invitationToken':inv['token'],'name':'Read-only fixture','password':'Synthetic-ontology-2026!'})
rh={'Authorization':'Bearer '+r['token'],'x-tenant':h['x-tenant']}
call('/api/apps/private_ontology/actions/list_notes',{},rh,status=403)
call(p+'notes',h=rh,status=403)
tools=call('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/list'},rh)['result']['tools'];assert not any(t['name'].startswith('app.private_ontology.') for t in tools)
print('PASS graph edges use real native and app relation foreign keys; independent shops and members without current action rights cannot read private tools')
for change in range(5):
 bad=copy.deepcopy(private);bad['id']='invalid_ontology'
 n=bad['intelligence']['ontology'][0]
 if change==0:n['fields']=['invented']
 elif change==1:n['nodeType']='product.property'
 elif change==2:n['relations']={'title':'fraud'}
 elif change==3:bad['intelligence']['entities']=[]
 else:bad['permissions'].remove('data.read')
 call('/api/apps/review',{'manifest':bad},h,status=400)
assert not any(p['id']=='invalid_ontology' for p in call('/api/apps',h=h)['packages'])
pack=next(p for p in call('/api/apps',h=h)['packages'] if p['id']==private['id'])
call('/api/apps/private_ontology',{'active':False,'revision':pack['revision']},h,method='PUT')
call('/api/apps/private_ontology/actions/list_notes',{},h,status=409)
# Empty optional metadata preserves old installed manifests and response shapes.
legacy=copy.deepcopy(m);legacy['id']='legacy_ontology';legacy['intelligence'].pop('ontology')
call('/api/apps',{'manifest':legacy},h)
assert 'ontology' not in call('/api/apps/legacy_ontology/entities/guides',h=h)
print('PASS invalid mappings reject before installation; disabled apps stop graph reads and legacy packages keep their original contract')
