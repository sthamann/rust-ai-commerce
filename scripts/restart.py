#!/usr/bin/env python3
"""Persist an API snapshot, restart server+DB externally, verify exact state."""
import json,os,urllib.request,pathlib,argparse,hashlib
p=argparse.ArgumentParser();p.add_argument('mode',choices=['snapshot','verify']);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];path=root/'.run/restart-state.json';path.parent.mkdir(exist_ok=True)
token=os.environ['MERCHANT_TOKEN'];base=os.environ.get('BASE_URL','http://127.0.0.1:8787')
def req(route,post=False):
    r=urllib.request.Request(base+route,data=b'{}' if post else None,headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
    with urllib.request.urlopen(r) as response:return json.load(response)
state={k:req(route,post) for k,route,post in [('catalog','/store-api/product',True),('orders','/api/search/order',True),('tasks','/api/agent/tasks',False),('policy','/api/policy',False),('runtime','/api/runtime',False),('extension','/api/extensions',False)]}
state['commerce']=req('/api/merchant/commerce')
users=root/'.run/users-state.json'
if users.exists():
    fixture=json.loads(users.read_text()); state['personalWorkspaces']={}
    for label in ('owner','other','editor'):
        session=fixture[label]; hs={'Content-Type':'application/json','Authorization':'Bearer '+session['token'],'x-tenant':session['workspace']}
        own={}
        for key,route,post in [('session','/api/auth/session',False),('catalog','/api/search/product',True),('orders','/api/search/order',True),('extension','/api/extensions',False),('graph','/api/knowledge',False)]:
            request=urllib.request.Request(base+route,data=b'{}' if post else None,headers=hs)
            with urllib.request.urlopen(request) as response: own[key]=json.load(response)
            if key=='graph':
                for field in ('needs','pairs'):own[key][field].sort(key=lambda v:json.dumps(v,sort_keys=True))
        state['personalWorkspaces'][label]=own
apps=root/'.run/apps-v5.json'
if apps.exists():
    owner=json.loads(apps.read_text())['owner']; hs={'Authorization':'Bearer '+owner['token'],'x-tenant':owner['workspace']}
    state['appMemory']={}
    for label,route in [('packages','/api/apps'),('rules','/api/apps/engraving/entities/rules'),('memory','/api/intelligence'),('recommendations','/store-api/intelligence/recommendations/mug')]:
        with urllib.request.urlopen(urllib.request.Request(base+route,headers=hs)) as response:state['appMemory'][label]=json.load(response)
state['knowledge']=req('/api/knowledge')
for key in ('needs','pairs'):
    state['knowledge'][key].sort(key=lambda v:json.dumps(v,sort_keys=True))
state['semanticIndex']=req('/api/knowledge/status')
state['conversations']=req('/api/agent/conversations')
state['histories']={c['id']:req('/api/agent/conversations/'+c['id']) for c in state['conversations']['conversations']}
if a.mode=='snapshot':path.write_text(json.dumps(state,sort_keys=True));path.chmod(0o600);print('Saved synthetic persisted-state snapshot');raise SystemExit()
old=json.loads(path.read_text());assert state==old,'State changed across restart'
report={'serverAndDatabaseRestart':'passed','catalogProducts':len(state['catalog']['elements']),'orders':len(state['orders']['data']),'storedTasks':len(state['tasks']['tasks']),'policyCountersIdentical':True,'eventProjectionIdentical':True,'extensionVersionIdentical':True,'graphRelationsIdentical':True,'semanticVectorsIdentical':True,'indexedProducts':state['semanticIndex']['indexedProducts'],'conversationHistoriesIdentical':True,'conversations':len(state['histories']),'personalSessionsAndWorkspacesIdentical':bool(state.get('personalWorkspaces')),'commerceConfigurationAndDeliveryStateIdentical':True,'appsAndObservedKnowledgeIdentical':bool(state.get('appMemory')),'stateDigest':hashlib.sha256(json.dumps(state,sort_keys=True).encode()).hexdigest()}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
