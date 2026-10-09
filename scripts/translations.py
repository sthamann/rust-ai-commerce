#!/usr/bin/env python3
"""Durable translation jobs against a local provider fixture, real SQL, native MCP and a cold restart; no paid calls."""
import copy,json,os,socket,threading,time,urllib.request,urllib.error,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from testing.runtime import ROOT,serve,stop
behavior={'reject':False,'invalid':False};captured=[]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  if self.path=='/api/embed':
   vectors=[[1.0]+[0.0]*1023 for _ in body['input']]
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'embeddings':vectors}).encode());return
  assert self.path in ['/api/chat','/v1/responses','/v1/messages'],self.path
  captured.append(body)
  if behavior['reject']:self.send_response(429);self.end_headers();return
  prompt=json.loads(body['input'] if 'input'in body else body['messages'][-1]['content']);assert prompt['targetLocale']=='it-IT'
  entries=[{'path':v['path'],'text':'IT '+v['text']}for v in prompt['texts']]
  if behavior['invalid']:entries.append({'path':'/price','text':'0'})
  text=json.dumps({'translations':entries})
  if self.path=='/v1/responses':answer={'status':'completed','output':[{'content':[{'type':'output_text','text':text}]}]}
  elif self.path=='/v1/messages':answer={'content':[{'type':'text','text':text}],'stop_reason':'end_turn'}
  else:answer={'message':{'content':text},'done_reason':'stop'}
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(answer).encode())
provider=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=provider.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{provider.server_address[1]}'
with socket.socket()as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
BASE=f'http://127.0.0.1:{port}';env={**os.environ,'BIND_ADDR':f'127.0.0.1:{port}','OLLAMA_URL':url,'OPENAI_BASE_URL':url+'/v1','OPENAI_API_KEY':'synthetic-fixture','ANTHROPIC_BASE_URL':url+'/v1','ANTHROPIC_API_KEY':'synthetic-fixture','PROCESS_ROLE':'translation-worker'}
# Dedicated worker and HTTP replica share leases. The normal verification server cannot consume these jobs:
# claim-only provider pin is per job model; using the replica's providers requires routing all translation
# processing through this fixture process. Pause the normal worker through server's HTTP role in runner.
env['PROCESS_ROLE']='all';public={};merchant={};checks=[];log=(ROOT/'.run/translation-contract.log').open('w');process=serve(env,BASE,log)
def req(path,body=None,h=None,method=None,expected=200):
 r=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**public,**(h or {})},method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(r,timeout=30)as response:status=response.status;data=json.load(response)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 assert status==expected,(path,status,expected,data)
 return data
def check(name):checks.append(name);print('PASS',name)
def detail(id):return req('/api/merchant/translations/'+id,h=merchant)
def wait(id,status='ready'):
 for _ in range(250):
  d=detail(id)
  if d['job']['status']==status:return d
  if d['job']['status']=='failed' and status!='failed':raise AssertionError(d['job'])
  time.sleep(.1)
 raise AssertionError(d)
def job(provider='ollama',overwrite=False):return req('/api/merchant/translations',{'targetLocale':'it-IT','inference':{'provider':provider,'model':'translation-fixture'},'overwrite':overwrite},merchant)['id']
try:
 suffix=uuid.uuid4().hex[:10];w=req('/api/auth/register',{'workspaceId':'translate-'+suffix,'workspaceName':'Translation fixture','name':'Fixture translator','email':'translate-'+suffix+'@example.test','password':'Synthetic-translation-2026!'})
 public={'x-tenant':w['workspace']};merchant={**public,'Authorization':'Bearer '+w['token']}
 conf=req('/api/merchant/commerce',h=merchant);conf['data']['locales'].append('it-IT');conf['data']['mainLocale']='es-ES';req('/api/merchant/commerce',{'data':conf['data'],'revision':conf['revision']},merchant,'PUT')
 p=req('/api/merchant/products/mug',h=merchant);p['translations']['es']={'name':'Taza fuente','description':'Descripción fuente'};p['extra']['seo']={'es':{'title':'Título fuente','description':'SEO fuente','slug':'taza'}};p['extra']['specifications']={'es':{'material':'Cerámica'}};p['extra']['richDescription']={'es':[{'type':'image','url':'https://example.test/picture.png','alt':'Taza'},{'type':'document','doc':{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'Descripción enriquecida','marks':[{'type':'link','attrs':{'href':'https://example.test/manual'}}]}]}]}}]};req('/api/merchant/products/mug',p,merchant,'PUT')
 id=job();d=wait(id);assert d['job']['processed']==d['job']['total'] and len(d['items'])==d['job']['total']
 assert any('Descripción fuente' in json.dumps(x,ensure_ascii=False)for x in captured)
 original=req('/api/merchant/products/mug',h=merchant);assert original['translations']['it']['name'] is None
 check('all products translate from the configured main language into durable drafts without silently changing live content')
 changed=req('/api/merchant/products/chair',h=merchant);changed['translations']['es']['name']='Manual edit';req('/api/merchant/products/chair',changed,merchant,'PUT')
 # Restart the owned replica; proposals are persisted and require no repeat inference.
 calls=len(captured);stop(process);process=serve(env,BASE,log);assert detail(id)['job']['status']=='ready' and len(captured)==calls
 r=req('/api/merchant/translations/'+id+'/apply',{},merchant);assert r['conflicts']==1 and r['applied']==d['job']['total']-1 and r['remaining']==0
 assert req('/api/merchant/products/chair',h=merchant)['translations']['es']['name']=='Manual edit'
 p=req('/api/merchant/products/mug',h=merchant);assert p['translations']['it']['name']=='IT Taza fuente' and p['extra']['seo']['it']['title']=='IT Título fuente' and p['extra']['specifications']['it']['material']=='IT Cerámica'
 assert p['extra']['richDescription']['it'][0]['url']=='https://example.test/picture.png' and p['extra']['richDescription']['it'][1]['doc']['content'][0]['content'][0]['marks'][0]['attrs']['href']=='https://example.test/manual'
 assert req('/store-api/product/mug',{},h={'x-commerce-locale':'it-IT'})['product']['name']=='IT Taza fuente'
 assert req('/api/merchant/translations/'+id+'/apply',{},merchant)['applied']==0
 check('cold restart preserves drafts; apply is idempotent and stale products conflict; SEO/specs/rich text translate while links, media and source remain intact')
 # Missing permission + foreign tenancy cannot trigger inference or access private drafts.
 inv=req('/api/workspace/invitations',{'email':'translate-viewer-'+suffix+'@example.test','role':'viewer'},merchant);viewer=req('/api/auth/accept',{'invitationToken':inv['token'],'name':'Fixture viewer','password':'Synthetic-translation-2026!'})
 vh={**public,'Authorization':'Bearer '+viewer['token']};req('/api/merchant/translations',{'targetLocale':'it-IT'},vh,expected=403)
 tools=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},vh)['result']['tools'];assert not any(t['name']=='merchant.translations.create'for t in tools)
 other=req('/api/auth/register',{'workspaceId':'translate-other-'+suffix,'workspaceName':'Other fixture','name':'Other translator','email':'translate-other-'+suffix+'@example.test','password':'Synthetic-translation-2026!'})
 req('/api/merchant/translations/'+id,h={'x-tenant':other['workspace'],'Authorization':'Bearer '+other['token']},expected=400)
 m=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'merchant.translations.detail','arguments':{'id':id}}},merchant);assert not m['result']['isError'] and m['result']['structuredContent']['counts']['conflict']==1
 check('API and MCP enforce catalog rights and shop isolation on translation jobs and drafts')
 # Provider rejection is resumable; unsafe output never becomes an applicable draft.
 behavior['reject']=True;failed=job('openai',True);wait(failed,'failed');behavior['reject']=False;req('/api/merchant/translations/'+failed,{'action':'resume'},merchant,'PUT');wait(failed)
 behavior['invalid']=True;invalid=job('anthropic',True);bad=wait(invalid,'failed');assert not bad['items'];req('/api/merchant/translations/'+invalid+'/apply',{},merchant,expected=409);req('/api/merchant/translations/'+invalid,{'action':'cancel'},merchant,'PUT');assert detail(invalid)['job']['status']=='cancelled'
 behavior['invalid']=False
 check('Ollama, OpenAI and Claude wire adapters work with the fixture; provider rejection resumes and invalid field-path output fails closed')
 print(json.dumps({'passed':len(checks),'paidCalls':0,'checks':checks}))
finally:stop(process);log.close();provider.shutdown();provider.server_close()
