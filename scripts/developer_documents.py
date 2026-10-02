#!/usr/bin/env python3
"""Local model wire fixtures verify app generation, provenance and document privacy, without paid providers."""
import os,json,pathlib,subprocess,threading,time,urllib.request,urllib.error,uuid,socket
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
root=pathlib.Path(__file__).resolve().parents[1];captured=[];behavior={'mode':'app'}
labels={'en':'Care guide','de':'Pflegehinweise','fr':'Entretien','es':'Cuidados'}
app_id='care_'+uuid.uuid4().hex[:10]
manifest={'id':app_id,'version':'1.0.0','coreApi':'1','runtime':'declarative','name':labels,'permissions':['data.read','data.write','storefront.slot','admin.slot'],'entities':[{'name':'guides','label':labels,'publicRead':True,'fields':[{'name':'content','label':labels,'kind':'string','required':True,'indexed':False,'translatable':True}]}],'slots':[{'location':'product.detail','component':'entity-list','label':labels}]}
class Model(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_POST(self):
  b=json.loads(self.rfile.read(int(self.headers['Content-Length'])));captured.append((self.path,b))
  if self.path=='/api/embed':out={'embeddings':[[1.0]+[0.0]*1023]}
  else:
   if behavior['mode']=='app':answer={'summary':labels,'manifest':manifest}
   elif behavior['mode']=='flow':answer={'summary':'Prüfbarer Preisvorschlag für die Leuchte.','changes':[{'product_id':'lamp','price':69.9}]}
   elif behavior['mode']=='citation':answer={'answer':'Invented citation','source_ids':['foreign-secret:0'],'missing_information':False}
   else:
    prompt=b.get('input','');source=prompt.split('"sourceId":"')[1].split('"')[0] if '"sourceId":"' in prompt else None
    answer={'answer':{'de-DE':'Die Tasse ist spülmaschinenfest.','fr-FR':'La tasse passe au lave-vaisselle.','es-ES':'La taza es apta para lavavajillas.'}.get(behavior['mode'],'The cup is dishwasher safe.'),'source_ids':[source] if source else [],'missing_information':source is None}
   out={'status':'completed','output':[{'content':[{'type':'output_text','text':json.dumps(answer)}]}]}
  if self.path.endswith('/messages'):out={'stop_reason':'end_turn','content':[{'type':'text','text':json.dumps(answer)}]}
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(out).encode())
server=ThreadingHTTPServer(('127.0.0.1',0),Model);threading.Thread(target=server.serve_forever,daemon=True).start();port=server.server_address[1]
sock=socket.socket();sock.bind(('127.0.0.1',0));test_port=sock.getsockname()[1];sock.close()
env={**os.environ,'BIND_ADDR':f'127.0.0.1:{test_port}','OPENAI_API_KEY':'local-wire-fixture','ANTHROPIC_API_KEY':'local-wire-fixture','ANTHROPIC_BASE_URL':f'http://127.0.0.1:{port}/v1','OPENAI_BASE_URL':f'http://127.0.0.1:{port}/v1','OLLAMA_URL':f'http://127.0.0.1:{port}'}
# A separate database keeps other replicas from consuming jobs with their provider configuration.
from urllib.parse import urlsplit,urlunsplit
fixture_db='commerce_docs_'+uuid.uuid4().hex[:12]
db=urlsplit(env['DATABASE_URL']);db_user=db.username or 'commerce'
container=os.getenv('TEST_DB_CONTAINER','rust-ai-commerce-postgres-1')
subprocess.run(['docker','exec',container,'createdb','-U',db_user,fixture_db],check=True)
env['DATABASE_URL']=urlunsplit((db.scheme,db.netloc,'/'+fixture_db,db.query,db.fragment))
log=(root/'.run/developer-documents.log').open('w');proc=subprocess.Popen([str(root/'target/debug/rust-ai-commerce')],cwd=root,env=env,stdout=log,stderr=log)
base=f'http://127.0.0.1:{test_port}';checks=[]
def call(path,body=None,session=None,tenant=None,expected=200,method=None,locale='de-DE',raw=None,contenttype=None):
 h={'Content-Type':contenttype or 'application/json','x-commerce-locale':locale}
 if session:h.update({'Authorization':'Bearer '+session['token'],'x-tenant':tenant or session['workspace']})
 elif tenant:h['x-tenant']=tenant
 req=urllib.request.Request(base+path,data=raw if raw is not None else None if body is None else json.dumps(body).encode(),headers=h,method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:status=r.status;out=json.load(r)
 except urllib.error.HTTPError as e:status=e.code;out=json.load(e)
 assert status==expected,(path,status,out)
 return out
def passed(s):checks.append(s);print('PASS',s)
try:
 for _ in range(100):
  try:call('/health');break
  except OSError:
   if proc.poll() is not None:raise RuntimeError('Fixture service failed')
   time.sleep(.2)
 slug='docs-'+uuid.uuid4().hex[:12];a=call('/api/auth/register',{'workspaceId':slug,'workspaceName':'Docs test','name':'Owner','email':slug+'@example.test','password':'Synthetic-tests-2026!'})
 e=call('/api/environments',{'name':'AI build sandbox'},a)
 b=call('/api/developer/generate',{'environment':e['id'],'prompt':'Create a multilingual care-guide app','inference':{'provider':'openai','model':'local-fixture'}},a)
 assert b['manifest']['entities'][0]['fields'][0]['translatable'] and len(b['manifest']['actions'])==2
 assert captured[-1][0]=='/v1/responses' and 'private' not in str(b['manifest'])
 manifest['version']='1.1.0';claude=call('/api/developer/generate',{'environment':e['id'],'prompt':'Create a second multilingual app version','inference':{'provider':'anthropic','model':'local-fixture'}},a);assert claude['manifest']['version']=='1.1.0' and captured[-1][0]=='/v1/messages'
 call('/api/developer/builds/'+b['id']+'/stage',{'approve':True,'digest':b['digest']},a)
 call('/api/apps/'+app_id+'/entities/guides',{'id':'care','fields':{'content':{'en':'Handwash','de':'Handwäsche','fr':'Lavage à la main','es':'Lavar a mano'}}},a,e['id'])
 record=call('/store-api/apps/'+app_id+'/actions/list_guides',{},a,e['id'])['elements'][0];assert record['content']['fr']=='Lavage à la main'
 call('/api/apps/'+app_id+'/entities/guides',{'id':'invalid','fields':{'content':{'tenant':'leak'}}},a,e['id'],expected=400)
 passed('Structured prompt generates immutable app, typed translated fields persist in sandbox, unknown translation keys rejected')
 tools=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},a)['result']['tools'];assert any(t['name']=='developer.import' for t in tools)
 public=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},tenant=slug)['result']['tools'];assert not any(t['name'].startswith('developer.') for t in public)
 task=call('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'developer.task','arguments':{'environment':e['id'],'prompt':'Extend the care app','agent':'codex'}}},a)['result']['structuredContent']
 assert task['agent']=='codex' and task['mcpConfig']['mcpServers']['rust-commerce-dev']['args']==['scripts/mcp_stdio.py']
 assert a['token'] not in json.dumps(task) and task['appSchema'] and e['id'] in task['task']
 passed('Codex/Claude MCP development tools are present only for authorized merchant roles')
 doc=call('/api/knowledge/documents',{'title':'Cup data sheet','productId':'mug','content':'Dishwasher safe stoneware cup. Capacity: 500 ml.'},a)
 behavior['mode']='de-DE'
 q=call('/store-api/product/mug/questions',{'question':'Dishwasher safe?','inference':{'provider':'openai','model':'local-fixture'}},tenant=slug);assert not q['sources'] and q['missingInformation']
 call('/api/knowledge/documents/'+doc['id'],{'approve':True,'visibility':'public','revision':1},a,method='PUT')
 q=call('/store-api/product/mug/questions',{'question':'Dishwasher','inference':{'provider':'openai','model':'local-fixture'}},tenant=slug);assert len(q['sources'])==1 and q['sources'][0]['contentHash']==doc['contentHash'] and q['sideEffects'] is False
 passed('Private data sheet is excluded until approval; public questions return exact source hash/excerpt')
 call('/api/knowledge/documents/'+doc['id']+'/index',{},a)
 for locale in ['de-DE','fr-FR','es-ES','en-GB']:
  behavior['mode']=locale;q=call('/store-api/product/mug/questions',{'question':'spülmaschinenfest?','inference':{'provider':'openai','model':'local-fixture'}},tenant=slug,locale=locale);assert q['sources'] and q['answer']
 assert any(p=='/api/embed' and b['input']=='spülmaschinenfest?' for p,b in captured)
 passed('Indexed semantic retrieval is actually consumed for cross-language questions with no lexical match')
 behavior['mode']='citation';call('/store-api/product/mug/questions',{'question':'Dishwasher','inference':{'provider':'openai'}},tenant=slug,expected=400)
 call('/api/knowledge/documents/'+doc['id'],{'approve':True,'visibility':'private','revision':1},a,method='PUT',expected=409)
 passed('Invented source citations and stale publication revisions are rejected')
 boundary='test-boundary';raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nUpload note\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="care.txt"\r\nContent-Type: text/plain\r\n\r\nHandle carefully.\r\n--{boundary}--\r\n').encode()
 uploaded=call('/api/knowledge/documents/upload',session=a,raw=raw,contenttype='multipart/form-data; boundary='+boundary);assert uploaded['sourceType']=='upload-text'
 call('/api/knowledge/documents',{'title':'foreign','productId':'not-owned','content':'x'},a,expected=400)
 passed('Multipart source upload works and foreign product reference fails')
 # Minimal real searchable PDF, independent of any fixture parser mock.
 stream=b'BT /F1 12 Tf 72 720 Td (Synthetic product sheet: stainless steel.) Tj ET'
 objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
 pdf=b'%PDF-1.4\n';offsets=[]
 for i,obj in enumerate(objects,1):offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
 xref=len(pdf);pdf+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(f'{o:010} 00000 n \n'.encode() for o in offsets)+f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()
 def pdf_upload(data,expected=200):
  raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nPDF sheet\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="sheet.pdf"\r\nContent-Type: application/pdf\r\n\r\n').encode()+data+f'\r\n--{boundary}--\r\n'.encode()
  return call('/api/knowledge/documents/upload',session=a,raw=raw,contenttype='multipart/form-data; boundary='+boundary,expected=expected)
 assert pdf_upload(pdf)['sourceType']=='pdf';pdf_upload(b'not a PDF',400)
 call('/api/knowledge/documents',{'title':'bad','content':'x','visibility':'public'},a,expected=400)
 passed('Real PDF is extracted in isolated bounded child process; malformed PDF and implicit public ingestion are rejected')
 behavior['mode']='flow';flow={'name':labels,'active':True,'event':'order.placed','condition':{'type':'alwaysValid'},'action':'ai_proposal','instruction':{l:'Propose setting only lamp price to 69.90 EUR.' for l in labels},'locale':'de-DE','inference':{'provider':'openai','model':'local-fixture'}}
 call('/api/automation/flows/price_draft',{'revision':0,'data':flow},a,method='PUT')
 c=call('/store-api/checkout/cart',{},tenant=slug)
 def shopper(path,body=None,method=None):
  req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','x-tenant':slug,'sw-context-token':c['token']},method=method)
  with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
 c=shopper('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':'lamp','quantity':1}]},'PUT')
 # No external provider, manual/default simulated order.
 req=urllib.request.Request(base+'/store-api/checkout/order',data=b'{}',headers={'Content-Type':'application/json','x-tenant':slug,'sw-context-token':c['token'],'Idempotency-Key':uuid.uuid4().hex})
 with urllib.request.urlopen(req,timeout=30) as r:order=json.load(r)
 for _ in range(100):
  jobs=call('/api/automation',session=a)['jobs'];done=[j for j in jobs if j['state']=='completed']
  if done:break
  time.sleep(.2)
 assert done and done[0]['result']['taskId'],jobs
 task=done[0]['result']['taskId'];ps=call('/api/search/product',{},a)['elements'];assert next(p for p in ps if p['id']=='lamp')['price']==74.9
 call('/api/agent/tasks/'+task+'/apply',{'approve':True},a)
 assert next(p for p in call('/api/search/product',{},a)['elements'] if p['id']=='lamp')['price']==69.9
 assert call('/api/automation',session=a)['jobs'][0]['applied']
 passed('Actual order flow creates an AI proposal through the model adapter; price changes only after merchant approval')
 print(json.dumps({'passed':len(checks),'checks':checks,'realModelInference':False,'paidProviderCalls':0},indent=2))
finally:
 proc.terminate();proc.wait(timeout=20);log.close();server.shutdown()
 subprocess.run(['docker','exec',container,'dropdb','--force','-U',db_user,fixture_db],check=True)
