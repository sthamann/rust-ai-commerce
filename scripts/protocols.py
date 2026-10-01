#!/usr/bin/env python3
"""Protocol flows exercise the same commerce core; model smoke test is opt-in."""
import json,os,pathlib,urllib.request,urllib.error,uuid,time
base=os.environ.get('BASE_URL','http://127.0.0.1:8787');token=os.environ.get('MERCHANT_TOKEN','');checks=[]
def call(path,body=None,h=None,method=None,expected=200):
    req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(req,timeout=200) as r:s=r.status;v=json.load(r)
    except urllib.error.HTTPError as e:s=e.code;v=json.load(e)
    assert s==expected,(s,v);return v
def ok(s):checks.append(s);print('PASS',s)
u=call('/ucp/v1/checkout-sessions',{'line_items':[{'item':{'id':'notebook'},'quantity':1}],'buyer':{'email':'demo@example.test'}})
h={'sw-context-token':u['context_token']};path='/ucp/v1/checkout-sessions/'+u['id'];assert u['line_items'][0]['item']['price']==1250
assert call(path,h=h)['buyer']['email']=='demo@example.test';ok('UCP create/get, currency minor units and context authorization')
u=call(path,{'line_items':[{'item':{'id':'mug'},'quantity':1}]},h,'PUT');assert len(u['line_items'])==1 and u['line_items'][0]['item']['id']=='mug' and 'buyer' not in u;ok('UCP PUT replaces items and buyer atomically')
call(path+'/complete',{}, {**h,'Idempotency-Key':'missing-'+uuid.uuid4().hex},expected=409);ok('UCP incomplete checkout cannot complete')
u=call(path,{'line_items':[{'item':{'id':'mug'},'quantity':1}],'buyer':{'email':'demo@example.test'}},h,'PUT');assert u['status']=='ready_for_complete'
u=call(path+'/complete',{}, {**h,'Idempotency-Key':'ucp-'+uuid.uuid4().hex});assert u['status']=='completed' and u['order']['id'];ok('UCP completes same durable checkout')
call(path+'/cancel',{},h,expected=409);ok('UCP cannot cancel completed order')
v=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25'}});assert v['result']['protocolVersion']=='2025-11-25';ok('MCP compatibility handshake')
call('/mcp',{'jsonrpc':'2.0','id':2,'method':'ping'},{'Origin':'https://evil.example'},expected=403);ok('MCP rejects foreign browser origins')
if token:
    ah={'Authorization':'Bearer '+token}
    call('/api/search/product',{},expected=401);ok('Admin catalog endpoint requires merchant authority')
    source=(pathlib.Path(__file__).resolve().parents[1]/'extensions/company-limit.wat').read_text()
    result=call('/api/extensions/activate',{'wat':source},ah);assert result['activated'];ok('Wasm source compiled at activation and persisted')
    call('/api/extensions/activate',{'wat':'(module (import "env" "fs" (func)) (func (export "approve") (param i64 i64) (result i32) i32.const 1))'},ah,expected=400);ok('extension host imports rejected')
    time.sleep(.3);r=call('/api/runtime',h=ah);assert r['eventsConsumed']>0 and r['outboxPending']==0;ok('durable outbox has a working consumer')
    if os.environ.get('TEST_MODEL')=='1':
        task=call('/api/agent/plan',{'instruction':'Setze den Bruttopreis der Arc Desk Light auf 74,90 EUR. Ändere sonst nichts.'},ah)
        p=task['preview']['proposal'];assert len(p['changes'])==1 and p['changes'][0]['product_id']=='lamp' and abs(p['changes'][0]['price']-74.9)<1e-9
        assert task['preview']['evalCount']>0;ok('real LLM produces correct typed merchant plan')
        call('/api/agent/tasks/'+task['taskId']+'/apply',{'approve':False},ah,expected=400)
        call('/api/agent/tasks/'+task['taskId']+'/apply',{'approve':True},ah)
        replay=call('/api/agent/tasks/'+task['taskId']+'/apply',{'approve':True},ah);assert replay['replayed'];ok('explicit approval applies plan once')
        ps=call('/store-api/product',{})['elements'];assert next(p for p in ps if p['id']=='lamp')['price']==74.9;ok('agent change affects customer catalog')
        advice=call('/api/concierge',{'request':'Ich brauche eine warme Leselampe für weniger als 100 Euro.'});assert 'lamp' in advice['answer']['recommended_ids'] and advice['evalCount']>0;ok('real customer inference selects existing product')
report={'passed':len(checks),'checks':checks,'modelTested':os.environ.get('TEST_MODEL')=='1'}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
