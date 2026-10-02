#!/usr/bin/env python3
"""Opt-in real local model proposes a registered app operation; approval exercises the same managed writer."""
import json,os,pathlib,urllib.request
assert os.getenv('TEST_MODEL')=='1','Explicit TEST_MODEL=1 required; this test performs real inference'
root=pathlib.Path(__file__).resolve().parents[1];fixture=json.loads((root/'.run/apps-v5.json').read_text());u=fixture['owner'];h={'Authorization':'Bearer '+u['token'],'x-tenant':u['workspace'],'Content-Type':'application/json'};base=os.getenv('BASE_URL','http://127.0.0.1:8787')
def call(path,body=None):
 req=urllib.request.Request(base+path,headers=h,data=None if body is None else json.dumps(body).encode())
 with urllib.request.urlopen(req,timeout=220) as r:return json.load(r)
before=call('/api/apps/engraving/entities/rules')['elements'][0]
chat=call('/api/agent/chat',{'message':'Set only the engraving app default fee to 800 integer cents using the registered save_rules action. Keep all catalog prices, stock and storefront layouts unchanged. Preview for approval.','inference':{'provider':'ollama'}})
message=chat['messages'][-1];preview=message['data']['preview'];change=preview['proposal']['app_action'];assert change['app']=='engraving' and change['action']=='save_rules';assert not preview['proposal']['changes'] and not preview['proposal']['experience'];assert json.loads(change['arguments_json'])['fields']['fee_minor']==800
assert call('/api/apps/engraving/entities/rules')['elements'][0]==before
assert call('/api/agent/tasks/'+message['data']['taskId']+'/apply',{'approve':True})['applied']
after=call('/api/apps/engraving/entities/rules')['elements'][0];assert after['fee_minor']==800 and after['revision']==before['revision']+1
report={'passed':3,'liveLocalModel':True,'checks':['Real local model selected the registered app action with exact integer fee','Preview did not write app data','Explicit approval updated app data once through the shared typed writer']}
print(json.dumps(report,indent=2))
if os.getenv('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
