#!/usr/bin/env python3
"""Real PostgreSQL/Qdrant synchronization; synthetic embeddings test transport, not AI quality."""
from testing.database import psql
import hashlib, json, os, pathlib, socket, subprocess, uuid, threading, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, urlunsplit
root=pathlib.Path(__file__).resolve().parents[1]
qdrant_url=os.environ.get("QDRANT_URL")
if not qdrant_url:raise SystemExit("Managed-search verification requires an explicitly configured QDRANT_URL")
state={"outage":False,"batches":[],"rerank":[],"bad_rerank":False}
class Embed(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def forward(self):
        if state['outage']:
            self.send_response(503);self.end_headers();return
        data=self.rfile.read(int(self.headers.get('Content-Length',0))) or None
        req=urllib.request.Request(qdrant_url+self.path,data=data,method=self.command,headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=15) as response: code=response.status;body=response.read()
        except urllib.error.HTTPError as e:code=e.code;body=e.read()
        self.send_response(code);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
    def do_GET(self): self.forward()
    def do_PUT(self): self.forward()
    def do_POST(self):
        if self.path=='/rerank':
            body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            state['rerank'].append(body)
            assert len(body['texts'])<=24 and all(len(t)<=4000 for t in body['texts'])
            result=[{'index':i if not state['bad_rerank'] else 0,'score':float(i)} for i in range(len(body['texts']))]
            self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(result).encode());return
        if self.path!='/api/embed':return self.forward()
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.path=='/api/embed' and body['truncate'] is False
        state['batches'].append(body['input'])
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(json.dumps({'embeddings':[[1.0]+[0.0]*383 for _ in (body['input'] if isinstance(body['input'],list) else [body['input']])]}).encode())
fixture=ThreadingHTTPServer(('127.0.0.1',0),Embed)
threading.Thread(target=fixture.serve_forever,daemon=True).start()
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
env={**os.environ,'BIND_ADDR':f'127.0.0.1:{port}','SHOP_DOMAIN_SUFFIX':'vendune.ai','OLLAMA_URL':f'http://127.0.0.1:{fixture.server_port}','EMBEDDING_MODEL':'synthetic-managed-contract-'+uuid.uuid4().hex[:8],'QDRANT_URL':f'http://127.0.0.1:{fixture.server_port}','RERANKER_URL':f'http://127.0.0.1:{fixture.server_port}'}
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
    return subprocess.check_output(psql(os.environ['DB_CONTAINER'],'commerce',os.environ['TEST_DATABASE'],'-XqAt','-v','ON_ERROR_STOP=1'),input=text,text=True).strip()
# Own database: prior suites' tenant catalogs, central providers and index leases are unrelated work.
fixture_db='commerce_managed_'+uuid.uuid4().hex[:12]
db=urlsplit(env['DATABASE_URL']); db_user=db.username or 'commerce'
subprocess.run(psql(os.environ['DB_CONTAINER'],db_user,'postgres','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE '+fixture_db),check=True)
env['DATABASE_URL']=urlunsplit(db._replace(path='/'+fixture_db))
env['TEST_DATABASE']=fixture_db
os.environ['TEST_DATABASE']=fixture_db
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
    # Existing sources must rebuild automatically when the configured model changes.
    name='vendune_product_v2_'+hashlib.sha256(env['EMBEDDING_MODEL'].encode()).hexdigest()[:16]+'_384'
    for _ in range(200):
        if sql("SELECT (SELECT count(*) FROM vector_index_queue WHERE tenant IN ('atelier','workshop'))+(SELECT count(*) FROM embedding_jobs WHERE tenant IN ('atelier','workshop'))")=='0' and sql("SELECT count(*) FROM embedding_generations WHERE tenant IN ('atelier','workshop') AND phase='complete'")=='2':break
        time.sleep(.1)
    assert sql("SELECT (SELECT count(*) FROM vector_index_queue WHERE tenant IN ('atelier','workshop'))+(SELECT count(*) FROM embedding_jobs WHERE tenant IN ('atelier','workshop'))")=='0',sql("SELECT tenant,kind,object_id,attempts FROM vector_index_queue UNION ALL SELECT tenant,kind,object_id,attempts FROM embedding_jobs")
    assert sql("SELECT count(*) FROM embedding_generations WHERE tenant IN ('atelier','workshop') AND phase='complete' AND model='"+env['EMBEDDING_MODEL']+"'")== '2'
    for tenant in ['atelier','workshop']:
        found=call('/api/knowledge/search',{'query':'contract candidate'},tenant)
        assert found['mode']=='hybrid' and found['hasIndexedProducts'] and len(found['hits'])==6,found
        assert found['graph']['tenant']==tenant and found['reranked']
        assert [h['rerankScore'] for h in found['hits']]==sorted([h['rerankScore'] for h in found['hits']],reverse=True)
    state['bad_rerank']=True
    assert not call('/api/knowledge/search',{'query':'lamp'},'workshop')['reranked']
    state['bad_rerank']=False
    print('PASS bounded real reranker transport validates candidate mapping and safely falls back on malformed responses')
    def qdrant(path,body):
        with urllib.request.urlopen(urllib.request.Request(os.environ['QDRANT_URL']+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})) as r:return json.load(r)['result']
    result=qdrant('/collections/'+name+'/points/query',{'query':[1.0]+[0.0]*383,'using':'text','filter':{'must':[{'key':'tenant','match':{'value':'workshop'}}]},'limit':100,'with_payload':True})
    assert len(result['points'])==int(sql("SELECT count(*) FROM products WHERE tenant='workshop'")) and all(p['payload']['tenant']=='workshop' for p in result['points'])
    print('PASS real Qdrant persists tenant/model-scoped vectors and Core hydrates current commerce rows')
    call('/store-api/product',{},'atelier','workshop.vendune.ai',400)
    call('/store-api/product',{},'missing','missing.vendune.ai',404)
    assert len(call('/store-api/product',{},'workshop','workshop.vendune.ai')['elements'])==6
    print('PASS shop hostname rejects unknown shops and conflicting tenant headers')
    state['outage']=True
    sql("DELETE FROM semantic_products WHERE tenant='workshop' AND product_id='lamp'")
    # Observe a real failed publication before recovery; sleeping can miss the
    # worker or consume several backoff attempts on a loaded integration database.
    for _ in range(300):
        failed=sql("SELECT coalesce(error_code,'') FROM vector_index_queue WHERE tenant='workshop' AND kind='product' AND object_id='lamp'")
        if failed=='vector_publication_unavailable':break
        time.sleep(.1)
    assert failed=='vector_publication_unavailable', failed
    assert sql("SELECT count(*) FROM vector_index_queue WHERE tenant='workshop' AND kind='product' AND object_id='lamp'")=='1'
    assert call('/api/knowledge/search',{'query':'lamp'},'workshop')['mode']=='lexical'
    state['outage']=False
    print('PASS unavailable Qdrant retains durable deletion and commerce search falls back to SQL')
    recovered_at=time.monotonic()
    for _ in range(300):
        points=qdrant('/collections/'+name+'/points/count',{'exact':True,'filter':{'must':[{'key':'tenant','match':{'value':'workshop'}},{'key':'object_id','match':{'value':'lamp'}}]}})
        if points['count']==0:break
        time.sleep(.1)
    assert points['count']==0, sql("SELECT attempts,error_code,available_at,lease_until FROM vector_index_queue WHERE tenant='workshop' AND object_id='lamp'")
    print(f'Index deletion recovered in {time.monotonic()-recovered_at:.2f}s after observed provider outage')
    assert qdrant('/collections/'+name+'/points/count',{'exact':True,'filter':{'must':[{'key':'tenant','match':{'value':'atelier'}}]}})['count']==int(sql("SELECT count(*) FROM products WHERE tenant='atelier'"))
    print('PASS durable delete removes the right tenant vector from Qdrant without deleting another shop')
    sql("INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock) SELECT 'workshop','batch-'||g,'Batch '||g,'fixtures','Automatic source '||g,10,19,10 FROM generate_series(1,150) g")
    for _ in range(400):
        if sql("SELECT count(*) FROM semantic_products WHERE tenant='workshop' AND product_id LIKE 'batch-%'")=='150':break
        time.sleep(.1)
    assert sql("SELECT count(*) FROM semantic_products WHERE tenant='workshop' AND product_id LIKE 'batch-%'")=='150'
    assert all(len(batch)<=32 for batch in state['batches']) and any(len(batch)>1 for batch in state['batches'])
    before=sql("SELECT content_hash FROM semantic_products WHERE tenant='workshop' AND product_id='batch-1'")
    sql("UPDATE products SET description='Changed automatic source' WHERE tenant='workshop' AND id='batch-1'")
    for _ in range(100):
        after=sql("SELECT content_hash FROM semantic_products WHERE tenant='workshop' AND product_id='batch-1'")
        if after!=before:break
        time.sleep(.1)
    assert after!=before
    sql("UPDATE products SET price=11,stock=9 WHERE tenant='workshop' AND id='batch-1'")
    assert sql("SELECT count(*) FROM embedding_jobs WHERE tenant='workshop' AND object_id='batch-1'")=='0'
    print('PASS 150 products index automatically in bounded batches; source changes re-embed, commerce-only changes do not')
    process.terminate();process.wait(timeout=15)
    env['EMBEDDING_MODEL']+='-changed'
    process=subprocess.Popen([str(root/'target/debug/vendune')],cwd=root,env=env,stdout=log,stderr=log)
    for _ in range(400):
        if process.poll() is not None: raise RuntimeError('Model-change restart failed')
        if sql("SELECT count(*) FROM semantic_products WHERE tenant='workshop' AND product_id LIKE 'batch-%' AND embedding_model='"+env['EMBEDDING_MODEL']+"'")=='150' and sql("SELECT count(*) FROM embedding_generations WHERE tenant IN ('atelier','workshop') AND phase='complete' AND model='"+env['EMBEDDING_MODEL']+"'")=='2' and sql("SELECT count(*) FROM embedding_jobs WHERE tenant IN ('atelier','workshop')")=='0':break
        time.sleep(.1)
    assert sql("SELECT count(*) FROM semantic_products WHERE tenant='workshop' AND product_id LIKE 'batch-%' AND embedding_model='"+env['EMBEDDING_MODEL']+"'")=='150'
    assert sql("SELECT count(*) FROM embedding_jobs WHERE tenant IN ('atelier','workshop')")=='0',sql("SELECT tenant,kind,object_id,attempts,error_code FROM embedding_jobs WHERE tenant IN ('atelier','workshop')")
    print('PASS cold model-change restart automatically rebuilds existing tenant catalogs without a reindex API call')

finally:
    process.terminate();process.wait(timeout=15);log.close();fixture.shutdown()
    subprocess.run(psql(os.environ['DB_CONTAINER'],db_user,'postgres','-v','ON_ERROR_STOP=1','-c','DROP DATABASE '+fixture_db+' WITH (FORCE)'),check=True)
