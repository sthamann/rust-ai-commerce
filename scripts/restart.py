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
if a.mode=='snapshot':path.write_text(json.dumps(state,sort_keys=True));print('Saved synthetic persisted-state snapshot');raise SystemExit()
old=json.loads(path.read_text());assert state==old,'State changed across restart'
report={'serverAndDatabaseRestart':'passed','catalogProducts':len(state['catalog']['elements']),'orders':len(state['orders']['data']),'storedTasks':len(state['tasks']['tasks']),'policyCountersIdentical':True,'eventProjectionIdentical':True,'extensionVersionIdentical':True,'stateDigest':hashlib.sha256(json.dumps(state,sort_keys=True).encode()).hexdigest()}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
