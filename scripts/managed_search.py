#!/usr/bin/env python3
"""Real PostgreSQL/Qdrant synchronization; synthetic embeddings test transport, not AI quality."""
import hashlib, json, os, pathlib, socket, subprocess, threading, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
root=pathlib.Path(__file__).resolve().parents[1]
state={"outage":False}
class Embed(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def forward(self):
        if state['outage']:
            self.send_response(503);self.end_headers();return
        data=self.rfile.read(int(self.headers.get('Content-Length',0))) or None
        req=urllib.request.Request(os.environ['QDRANT_URL']+self.path,data=data,method=self.command,headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=15) as response: code=response.status;body=response.read()
        except urllib.error.HTTPError as e:code=e.code;body=e.read()
        self.send_response(code);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
    def do_GET(self): self.forward()
    def do_PUT(self): self.forward()
    def do_POST(self):
        if self.path!='/api/embed':return self.forward()
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.path=='/api/embed' and body['truncate'] is False
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(json.dumps({'embeddings':[[1.0]+[0.0]*1023]}).encode())
fixture=ThreadingHTTPServer(('127.0.0.1',0),Embed)
threading.Thread(target=fixture.serve_forever,daemon=True).start()
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
env={**os.environ,'BIND_ADDR':f'127.0.0.1:{port}','SHOP_DOMAIN_SUFFIX':'vendune.ai','OLLAMA_URL':f'http://127.0.0.1:{fixture.server_port}','EMBEDDING_MODEL':'synthetic-managed-contract','QDRANT_URL':f'http://127.0.0.1:{fixture.server_port}'}
base=f'http://127.0.0.1:{port}'; token=os.environ['MERCHANT_TOKEN']
def call(path,body=None,tenant='atelier',host=None,status=200):
    headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'x-tenant':tenant}
    if host: headers['Host']=host
    req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=30) as r: code=r.status; value=json.load(r)
    except urllib.error.HTTPError as e: code=e.code;value=json.load(e)
    assert code==status,(code,value)
    return value

def sql(text):
    return subprocess.check_output(['docker','exec','-i',os.environ['DB_CONTAINER'],'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','commerce','-d',os.environ['TEST_DATABASE']],input=text,text=True).strip()
log=open(root/'.run/managed-search.log','w')
process=subprocess.Popen([str(root/'target/debug/vendune')],cwd=root,env=env,stdout=log,stderr=log)
try:
    for _ in range(100):
        if process.poll() is not None: raise RuntimeError('Managed search app failed; see .run/managed-search.log')
        try: call('/health');break
        except OSError: time.sleep(.1)
    assert sql("SELECT count(*) FROM pg_extension WHERE extname IN ('age','vector')")=='0'
    assert sql("SELECT udt_name FROM information_schema.columns WHERE table_name='semantic_products' AND column_name='embedding'")=='_float4'
    print('PASS ordinary PostgreSQL has no AGE/vector dependency')
    for tenant in ['atelier','workshop']:
        call('/api/knowledge/reindex',{},tenant)
    name='vendune_product_'+hashlib.sha256(env['EMBEDDING_MODEL'].encode()).hexdigest()[:16]
    for _ in range(50):
        if sql("SELECT count(*) FROM vector_index_queue")=='0':break
        time.sleep(.1)
    assert sql("SELECT count(*) FROM vector_index_queue")=='0'
    for tenant in ['atelier','workshop']:
        found=call('/api/knowledge/search',{'query':'contract candidate'},tenant)
        assert found['mode']=='vector' and found['indexedProducts']==6 and len(found['hits'])==6
        assert found['graph']['tenant']==tenant
    def qdrant(path,body):
        with urllib.request.urlopen(urllib.request.Request(os.environ['QDRANT_URL']+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})) as r:return json.load(r)['result']
    result=qdrant('/collections/'+name+'/points/query',{'query':[1.0]+[0.0]*1023,'filter':{'must':[{'key':'tenant','match':{'value':'workshop'}}]},'limit':100,'with_payload':True})
    assert len(result['points'])==6 and all(p['payload']['tenant']=='workshop' for p in result['points'])
    print('PASS real Qdrant persists tenant/model-scoped vectors and Core hydrates current commerce rows')
    call('/store-api/product',{},'atelier','workshop.vendune.ai',400)
    call('/store-api/product',{},'missing','missing.vendune.ai',404)
    assert len(call('/store-api/product',{},'workshop','workshop.vendune.ai')['elements'])==6
    print('PASS shop hostname rejects unknown shops and conflicting tenant headers')
    state['outage']=True
    sql("DELETE FROM semantic_products WHERE tenant='workshop' AND product_id='lamp'")
    time.sleep(2.3)
    assert sql("SELECT count(*) FROM vector_index_queue WHERE tenant='workshop' AND kind='product' AND object_id='lamp'")=='1'
    assert call('/api/knowledge/search',{'query':'lamp'},'workshop')['mode']=='lexical'
    state['outage']=False
    print('PASS unavailable Qdrant retains durable deletion and commerce search falls back to SQL')
    for _ in range(80):
        points=qdrant('/collections/'+name+'/points/count',{'exact':True,'filter':{'must':[{'key':'tenant','match':{'value':'workshop'}},{'key':'object_id','match':{'value':'lamp'}}]}})
        if points['count']==0:break
        time.sleep(.1)
    assert points['count']==0
    assert qdrant('/collections/'+name+'/points/count',{'exact':True,'filter':{'must':[{'key':'tenant','match':{'value':'atelier'}}]}})['count']==6
    print('PASS durable delete removes the right tenant vector from Qdrant without deleting another shop')
finally:
    process.terminate();process.wait(timeout=15);log.close();fixture.shutdown()
