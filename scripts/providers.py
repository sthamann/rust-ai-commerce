#!/usr/bin/env python3
"""Cloud wire-contract tests using local HTTP servers, NOT live cloud inference."""
from testing.app_approval import consent
from testing.database import psql
import json, copy, os, pathlib, subprocess, threading, time, urllib.request, urllib.error, uuid, concurrent.futures
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

root = pathlib.Path(__file__).resolve().parents[1]
root.joinpath('.run').mkdir(exist_ok=True)
captured = []; checks = []; behavior = {'mode': 'normal'}; inference_started=threading.Event()
proposal = {'summary':'HTTP provider contract test; not live inference.', 'changes':[{'product_id':'lamp','price':71.23}], 'experience':None, 'expected_experience_revision':None}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        captured.append((self.path,{k.lower():v for k,v in self.headers.items()},body))
        if behavior['mode']=='slow':
            inference_started.set();time.sleep(1.5)
        if behavior['mode']=='reject':
            self.send_response(429); self.end_headers(); return
        result=proposal
        if behavior['mode'] in ['extract','bad-extract']:
            quote='Ceramic capacity 500 ml.' if behavior['mode']=='extract' else 'Invented waterproof certification'
            result={'claims':[{'text':quote,'quote':quote,'nodeType':'property'}]}
        if behavior['mode'] in ['read-tools','write-tool']:
            if behavior.setdefault('round',0)==0:
                result={**proposal,'changes':[],'tool_calls':[{'name':'merchant.orders' if behavior['mode']=='read-tools' else 'merchant.apply','arguments_json':'{}'}]}
            behavior['round']+=1
        schema=(body.get('text',{}).get('format',{}).get('schema') or body.get('response_format',{}).get('json_schema',{}).get('schema') or body.get('output_config',{}).get('format',{}).get('schema') or body.get('format',{}))
        if schema.get('required')==['tool_calls']:
            result={'tool_calls':result.get('tool_calls',{}) if behavior['mode']=='invalid-read' else result.get('tool_calls',[])}
        if self.path=='/v1/responses':
            answer={'status':'incomplete' if behavior['mode']=='incomplete' else 'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(result)}]}], 'usage':{'input_tokens':10,'output_tokens':20}}
        elif self.path=='/v1/chat/completions':
            answer={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(result)}}],'usage':{'prompt_tokens':10,'completion_tokens':20}}
        elif self.path=='/v1/messages':
            answer={'content':[{'type':'thinking','thinking':'contract fixture'},{'type':'text','text':json.dumps(result)}],'stop_reason':'end_turn','usage':{'input_tokens':10,'output_tokens':20}}
        else:
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(json.dumps(answer).encode())
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
port=server.server_address[1]
env={**os.environ,'OPENAI_API_KEY':'contract-openai','ANTHROPIC_API_KEY':'contract-claude','OPENAI_BASE_URL':f'http://127.0.0.1:{port}/v1','ANTHROPIC_BASE_URL':f'http://127.0.0.1:{port}/v1','FACT_SIGNING_SEED':'07'*32,'BIND_ADDR':'127.0.0.1:8789'}
log=open(root/'.run/provider-contract.log','w')
process=subprocess.Popen([str(root/'target/debug/vendune')],cwd=root,env=env,stdout=log,stderr=log)
base='http://127.0.0.1:8789'; ah={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN'],'x-tenant':'workshop'}
def call(path,body=None,headers=None,expected=200,method=None):
    if path == '/api/apps' and isinstance(body,dict) and ('manifest' in body or 'builtIn' in body): body=consent(body)
    request=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(ah if headers is None else headers)},method=method)
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
    behavior.update(mode='read-tools',round=0)
    planned=call('/api/agent/chat',{'message':'Read orders through the native tool first.','inference':{'provider':'openai'}})
    trace=planned['messages'][-1]['data']['preview']['toolTrace'];assert trace[0]['tool']=='merchant.orders' and behavior['round']==3
    assert 'gross EUR' not in captured[-1][2]['instructions']
    assert captured[-2][2]['text']['format']['schema']['required']==['tool_calls']
    assert 'Current native read transcript' in captured[-1][2]['input']
    passed('Agent reads through the current capability dispatcher before a separate final proposal, with currency-neutral planning')
    behavior['mode']='invalid-read'
    malformed=call('/api/agent/chat',{'message':'Malformed read decision','inference':{'provider':'openai'}})
    assert malformed['messages'][-1]['data']['error'] and 'taskId' not in malformed['messages'][-1]['data']
    passed('Malformed tool decisions stop before reads or executable proposals')
    behavior.update(mode='write-tool',round=0)
    rejected=call('/api/agent/chat',{'message':'Unsupported direct write tool','inference':{'provider':'openai'}})
    assert rejected['messages'][-1]['data']['error'] and 'taskId' not in rejected['messages'][-1]['data']
    passed('Model-selected write tools cannot execute or create an executable task')
    behavior['mode']='normal'
    from testing.extraction import verify_extraction
    from testing.provider_fleet import shared_provider
    with shared_provider(call, env['OPENAI_BASE_URL']):
        verify_extraction(call, captured, behavior, passed)
    original=call('/api/merchant/commerce')
    def policy(value):
        snapshot=call('/api/merchant/commerce');data=copy.deepcopy(snapshot['data']);data['aiPolicy']=value
        return call('/api/merchant/commerce',{'revision':snapshot['revision'],'data':data},method='PUT')
    corridor={'productId':'lamp','currency':'EUR','minimumMinor':7000,'maximumMinor':8000,'minimumMarginBps':0}
    enabled={'corridors':[corridor], 'autonomy':{'enabled':True,'maxChangeBps':500,'productsPerDay':1}}
    policy(enabled)
    proposal['changes']=[{'product_id':'lamp','price':69}]
    rejected=call('/api/agent/chat',{'message':'Try outside price corridor','inference':{'provider':'openai'}})
    assert rejected['messages'][-1]['data']['error'];passed('Merchant price corridors reject invalid previews before executable tasks exist')
    proposal['changes']=[{'product_id':'lamp','price':72.5}]
    draft=call('/api/agent/chat',{'message':'Within explicit budget','inference':{'provider':'openai'}})['messages'][-1]['data']
    call('/api/intelligence/autonomy.apply',{'taskId':draft['taskId']},headers={**ah,'x-tenant':'atelier'},expected=404)
    assert call('/api/intelligence/autonomy.apply',{'taskId':draft['taskId']})['applied']
    assert call('/api/intelligence/autonomy.apply',{'taskId':draft['taskId']})['replayed']
    proposal['changes']=[{'product_id':'lamp','price':75}]
    draft=call('/api/agent/chat',{'message':'Compounding must fail','inference':{'provider':'openai'}})['messages'][-1]['data']
    call('/api/intelligence/autonomy.apply',{'taskId':draft['taskId']},expected=409)
    assert next(p for p in call('/api/search/product',{})['elements'] if p['id']=='lamp')['price']==72.5
    passed('Autonomy applies once within native settings and cannot compound beyond its original daily price baseline or affect foreign shops')
    proposal['changes']=[{'product_id':'lamp','price':73}]
    draft=call('/api/agent/chat',{'message':'Policy revision test','inference':{'provider':'openai'}})['messages'][-1]['data']
    locked=copy.deepcopy(enabled);locked['corridors'][0]['priceLocked']=True;policy(locked)
    call('/api/agent/tasks/'+draft['taskId']+'/apply',{'approve':True},expected=409)
    policy(original['data'].get('aiPolicy',{}))
    proposal['changes']=[{'product_id':'lamp','price':71.23}]
    draft=call('/api/agent/chat',{'message':'Restore synthetic fixture','inference':{'provider':'openai'}})['messages'][-1]['data']
    call('/api/agent/tasks/'+draft['taskId']+'/apply',{'approve':True})
    passed('Settings changes invalidate earlier proposals and applied state remains unchanged after denial')
    keys=call('/.well-known/commerce-facts.json',headers={})
    facts=call('/store-api/product/lamp/facts/signed',headers={'x-tenant':'workshop'})
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    import base64
    decode=lambda v:base64.urlsafe_b64decode(v+'='*((-len(v))%4))
    Ed25519PublicKey.from_public_bytes(decode(keys['keys'][0]['x'])).verify(decode(facts['signature']),decode(facts['payloadBase64']))
    assert json.loads(decode(facts['payloadBase64']))==facts['payload'] and facts['payload']['tenant']=='workshop'
    assert facts['payload']['expiresAt']-facts['payload']['issuedAt']==300
    assert call('/ucp/v1/products/lamp/facts',headers={'x-tenant':'workshop'})['payload']['tenant']=='workshop'
    passed('Real public and UCP-extension facts bind native product data and channel identity with independently verified Ed25519 signatures')
    request=urllib.request.Request(base+'/api/agent/chat/stream',data=json.dumps({'message':'Stream validated response','inference':{'provider':'openai'}}).encode(),headers={'Content-Type':'application/json',**ah})
    with urllib.request.urlopen(request,timeout=30) as response:
        frames=response.read().decode();assert response.headers['content-type'].startswith('text/event-stream') and 'event: accepted' in frames and 'event: complete' in frames
    passed('SSE returns acceptance and a native persisted chat completion through the same authorization owner')
    behavior['mode']='incomplete'
    v=call('/api/agent/chat',{'message':'incomplete','inference':{'provider':'openai'}}); assert v['messages'][-1]['data']['error'] and 'taskId' not in v['messages'][-1]['data']; passed('Incomplete OpenAI output creates explicit error without executable proposal')
    behavior['mode']='reject'
    v=call('/api/agent/chat',{'message':'rejected','inference':{'provider':'anthropic'}}); assert v['messages'][-1]['data']['error']; passed('Cloud HTTP rejection has no silent local-model fallback')
    if os.getenv('TEST_PERSONAL')=='1':
        fixture=json.loads((root/'.run/users-state.json').read_text()); owner=fixture['owner'];editor=fixture['editor'];other=fixture['other']
        def personal(s):return {'Authorization':'Bearer '+s['token'],'x-tenant':s['workspace']}
        invitation=call('/api/workspace/invitations',{'email':'plan-reader-'+uuid.uuid4().hex[:10]+'@example.test','role':'viewer'},personal(owner))
        reader=call('/api/auth/accept',{'invitationToken':invitation['token'],'name':'Plan Reader','password':'Synthetic-account-2026!'},headers={})
        before=next(p for p in call('/api/search/product',{},personal(other))['elements'] if p['id']=='lamp')['price']
        behavior['mode']='normal'
        planned=call('/api/agent/chat',{'message':'Create a price proposal; do not apply.','inference':{'provider':'openai','model':'contract-openai-model'}},personal(reader))
        task=planned['messages'][-1]['data']['taskId']
        call('/api/agent/tasks/'+task+'/apply',{'approve':True},personal(reader),403)
        call('/api/agent/tasks/'+task+'/apply',{'approve':True},personal(other),404)
        assert call('/api/agent/tasks/'+task+'/apply',{'approve':True},personal(editor))['applied']
        assert next(p for p in call('/api/search/product',{},personal(owner))['elements'] if p['id']=='lamp')['price']==71.23
        assert next(p for p in call('/api/search/product',{},personal(other))['elements'] if p['id']=='lamp')['price']==before
        passed('Personal reader can plan; only authorized editor executes in the owning shop')
    behavior['mode']='normal'
    call('/api/apps',{'builtIn':'engraving'})
    before=call('/api/apps/engraving/entities/rules')['elements'][0]
    proposal['changes']=[];proposal['app_action']={'app':'engraving','action':'save_rules','arguments_json':json.dumps({'id':'default','fields':{'fee_minor':350}})}
    planned=call('/api/agent/chat',{'message':'Set engraving fee to 350 cents; preview only.','inference':{'provider':'openai'}})
    app_task=planned['messages'][-1]['data']['taskId']
    assert call('/api/apps/engraving/entities/rules')['elements'][0]['fee_minor']==before['fee_minor']
    assert call('/api/agent/tasks/'+app_task+'/apply',{'approve':True})['applied']
    after=call('/api/apps/engraving/entities/rules')['elements'][0];assert after['fee_minor']==350
    call('/api/agent/tasks/'+app_task+'/apply',{'approve':True});assert call('/api/apps/engraving/entities/rules')['elements'][0]['revision']==after['revision']
    passed('Registered app action uses grounded preview, explicit atomic approval and idempotent replay')
    proposal['app_action']['arguments_json']=json.dumps({'id':'default','fields':{'fee_minor':400}})
    planned=call('/api/agent/chat',{'message':'Preview another fee change.','inference':{'provider':'openai'}})
    app_task=planned['messages'][-1]['data']['taskId']
    call('/api/apps/engraving/entities/rules',{'id':'default','revision':after['revision'],'fields':{'fee_minor':450}})
    call('/api/agent/tasks/'+app_task+'/apply',{'approve':True},expected=409)
    assert call('/api/apps/engraving/entities/rules')['elements'][0]['fee_minor']==450
    passed('App record changed after preview rejects approval without partial writes')
    proposal.pop('app_action');behavior['mode']='slow';inference_started.clear()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        turn=executor.submit(call,'/api/agent/chat',{'conversationId':cid,'message':'Slow provider lease test','inference':{'provider':'openai'}})
        assert inference_started.wait(10)
        call('/api/agent/chat',{'conversationId':cid,'message':'Concurrent conflicting turn','inference':{'provider':'openai'}},expected=409)
        assert call('/health')['status']=='ok'
        idle=subprocess.check_output(psql(os.getenv('DB_CONTAINER','vendune-postgres-1'),'commerce',os.getenv('TEST_DATABASE','commerce'),'-Atc',"SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction' AND query LIKE '%pg_try_advisory_xact_lock%'"),text=True).strip()
        assert idle=='0';assert turn.result()['messages'][-1]['data']['taskId']
    behavior['mode']='normal'
    passed('Conversation lease excludes concurrent turns while inference holds no advisory transaction or DB connection')
    process.terminate();process.wait(timeout=15)
    env.update(OPENAI_PROTOCOL='chat',INFERENCE_MODEL_PLANNER_OPENAI='self-hosted-planner',INFERENCE_PROMPT_CACHE='true')
    process=subprocess.Popen([str(root/'target/debug/vendune')],cwd=root,env=env,stdout=log,stderr=log)
    for _ in range(60):
        try:call('/health');break
        except OSError:time.sleep(.1)
    streamed=call('/api/agent/chat',{'message':'Use routed self-hosted planner','inference':{'provider':'openai'}})
    path,_,body=captured[-1];assert path=='/v1/chat/completions' and body['model']=='self-hosted-planner' and body['response_format']['json_schema']['strict']
    assert not streamed['messages'][-1]['data'].get('error')
    call('/api/agent/chat',{'message':'Explicit model still wins','inference':{'provider':'openai','model':'chosen-model'}})
    assert captured[-1][2]['model']=='chosen-model'
    call('/api/agent/chat',{'message':'Stable Claude system cache','inference':{'provider':'anthropic'}})
    assert captured[-1][2]['system'][0]['cache_control']=={'type':'ephemeral'}
    passed('Self-hosted chat-completions schema, task model routing, explicit-model precedence and Claude prompt-cache contract work through real HTTP')
    report={'passed':len(checks),'liveCloudInference':False,'checks':checks}
    print(json.dumps(report,indent=2))
    if os.environ.get('REPORT_PATH'): pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
finally:
    process.terminate(); process.wait(timeout=15); log.close(); server.shutdown()
