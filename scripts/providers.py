#!/usr/bin/env python3
"""Cloud wire-contract tests using local HTTP servers, NOT live cloud inference."""
import json, os, pathlib, subprocess, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

root = pathlib.Path(__file__).resolve().parents[1]
root.joinpath('.run').mkdir(exist_ok=True)
captured = []; checks = []; behavior = {'mode': 'normal'}
proposal = {'summary':'HTTP provider contract test; not live inference.', 'changes':[{'product_id':'lamp','price':71.23}], 'experience':None, 'expected_experience_revision':None}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        captured.append((self.path,{k.lower():v for k,v in self.headers.items()},body))
        if behavior['mode']=='reject':
            self.send_response(429); self.end_headers(); return
        if self.path=='/v1/responses':
            answer={'status':'incomplete' if behavior['mode']=='incomplete' else 'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(proposal)}]}], 'usage':{'input_tokens':10,'output_tokens':20}}
        elif self.path=='/v1/messages':
            answer={'content':[{'type':'thinking','thinking':'contract fixture'},{'type':'text','text':json.dumps(proposal)}],'stop_reason':'end_turn','usage':{'input_tokens':10,'output_tokens':20}}
        else:
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(json.dumps(answer).encode())
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
port=server.server_address[1]
env={**os.environ,'OPENAI_API_KEY':'contract-openai','ANTHROPIC_API_KEY':'contract-claude','OPENAI_BASE_URL':f'http://127.0.0.1:{port}/v1','ANTHROPIC_BASE_URL':f'http://127.0.0.1:{port}/v1','BIND_ADDR':'127.0.0.1:8789'}
log=open(root/'.run/provider-contract.log','w')
process=subprocess.Popen([str(root/'target/debug/rust-ai-commerce')],cwd=root,env=env,stdout=log,stderr=log)
base='http://127.0.0.1:8789'; ah={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN'],'x-tenant':'workshop'}
def call(path,body=None,headers=None,expected=200):
    request=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(ah if headers is None else headers)})
    try:
        with urllib.request.urlopen(request,timeout=30) as r: status=r.status; value=json.load(r)
    except urllib.error.HTTPError as e: status=e.code; value=json.load(e)
    assert status==expected,(status,value)
    return value
def passed(name): checks.append(name); print('PASS',name)
try:
    for _ in range(60):
        if process.poll() is not None: raise RuntimeError('Contract app failed: inspect .run/provider-contract.log')
        try: call('/health'); break
        except OSError: time.sleep(.25)
    call('/api/agent/providers',headers={},expected=401); passed('Provider configuration requires merchant authentication')
    config=call('/api/agent/providers'); assert all(p['configured'] for p in config['providers']); assert 'contract-openai' not in json.dumps(config); passed('Credentials never returned to frontend')
    conversation=call('/api/agent/chat',{'message':'Contract test: change lamp price.','inference':{'provider':'openai','model':'contract-openai-model'}})
    cid=conversation['conversationId']; message=conversation['messages'][-1]; assert message['data']['preview']['inference']=='openai'
    path,headers,body=captured[-1]; assert path=='/v1/responses' and headers['authorization']=='Bearer contract-openai' and body['store'] is False
    assert body['text']['format']['strict'] and body['model']=='contract-openai-model'; passed('OpenAI Responses adapter sends native strict schema and parses structured result')
    task=message['data']['taskId']; result=call('/api/agent/tasks/'+task+'/apply',{'approve':True}); assert result['applied']
    restored=call('/api/agent/conversations/'+cid); assert restored['messages'][-1]['applied']; passed('Cloud-derived preview uses real approval transaction and persists applied state')
    conversation=call('/api/agent/chat',{'conversationId':cid,'message':'Tell me the previous task.','inference':{'provider':'anthropic','model':'contract-claude-model'}})
    path,headers,body=captured[-1]; assert path=='/v1/messages' and headers['x-api-key']=='contract-claude'
    assert body['output_config']['format']['type']=='json_schema' and 'Contract test' in body['messages'][0]['content']; passed('Claude Messages adapter preserves conversation context and ignores thinking blocks')
    call('/api/agent/conversations/'+cid,headers={**ah,'x-tenant':'atelier'},expected=404); passed('Conversation history cannot cross tenant boundary')
    behavior['mode']='incomplete'
    v=call('/api/agent/chat',{'message':'incomplete','inference':{'provider':'openai'}}); assert v['messages'][-1]['data']['error'] and 'taskId' not in v['messages'][-1]['data']; passed('Incomplete OpenAI output creates explicit error without executable proposal')
    behavior['mode']='reject'
    v=call('/api/agent/chat',{'message':'rejected','inference':{'provider':'anthropic'}}); assert v['messages'][-1]['data']['error']; passed('Cloud HTTP rejection has no silent local-model fallback')
    report={'passed':len(checks),'liveCloudInference':False,'checks':checks}
    print(json.dumps(report,indent=2))
    if os.environ.get('REPORT_PATH'): pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
finally:
    process.terminate(); process.wait(timeout=15); log.close(); server.shutdown()
