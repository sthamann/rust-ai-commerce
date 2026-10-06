"""Control-plane regressions on the real HTTP/database path; disposable synthetic shops and local model wire fixtures only."""
import json, threading, time, urllib.request, urllib.error, os, pathlib, subprocess, socket, tempfile, signal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def verify(req, sql, owner, other, seed, empty, oh, h, check, base):
    for path in ['/api/platform/ai','/api/platform/infrastructure','/api/platform/shops/'+seed]:
        req(path, headers=h(other), expected=403)
    shop=req('/api/platform/shops/'+seed,headers=oh)
    assert shop['counts']['products']>0 and shop['members'][0]['email']==owner['user']['email']
    assert shop['status']=='active' and shop['createdAt'] and shop['salesChannels']
    assert 'studioUrl' in shop['urls']
    infra=req('/api/platform/infrastructure',headers=oh)
    assert infra['database']['healthy'] and infra['database']['bytes']>0 and infra['process']['poolConnections']>0
    assert 'containerCpuPercent' in infra['resources']
    check('operator-only shop dossier and real infrastructure measurements, including explicit unavailable resource values')
    captured=[]
    class Model(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_POST(self):
            data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            captured.append((self.path,self.headers.get('Authorization'),data['model']))
            answer={'summary':'Synthetic inherited provider wire fixture','changes':[],'experience':None,'expected_experience_revision':None}
            self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
            self.wfile.write(json.dumps({'message':{'content':json.dumps(answer)},'done_reason':'stop'}).encode())
    fixture=ThreadingHTTPServer(('127.0.0.1',0),Model)
    threading.Thread(target=fixture.serve_forever,daemon=True).start()
    original_data=sql('SELECT data::text FROM platform_ai WHERE id=true;')
    original=req('/api/platform/ai',headers=oh)
    settings=json.loads(json.dumps(original['settings']))
    settings['defaultProvider']='ollama'
    settings['providers']['ollama']={'endpoint':f'http://127.0.0.1:{fixture.server_address[1]}','enabled':True,'model':'inherited-fixture'}
    key='synthetic-encrypted-key-not-a-real-credential'
    def save(body,expected=200):return req('/api/platform/ai',body,oh,expected,method='PUT')
    try:
        written=save({'revision':original['revision'],'settings':settings,'keys':{'ollama':key}})
        assert written['keyStored']['ollama'] and key not in json.dumps(written)
        persisted=sql('SELECT secrets::text FROM platform_ai WHERE id=true;')
        assert key not in persisted and 'ollama' in persisted
        save({'revision':original['revision'],'settings':settings},409)
        for tenant in [seed,other['workspace']]:
            account=owner if tenant==seed else other
            chat=req('/api/agent/chat',{'message':'Describe the shop without changes','inference':{'provider':'platform','model':'ignored-stale-client-model'}},h(account,tenant))
            assert chat['messages'][-1]['data']['preview']['inference']=='ollama'
        # A new independent process must decrypt the persisted key and use the same default.
        with socket.socket() as probe:
            probe.bind(('127.0.0.1',0));replica_port=probe.getsockname()[1]
        with tempfile.TemporaryFile() as log:
            root=pathlib.Path(__file__).resolve().parents[1]
            replica=subprocess.Popen([str(root/'target/debug/vendune')],cwd=root,env={**os.environ,'BIND_ADDR':f'127.0.0.1:{replica_port}'},stdout=log,stderr=log)
            try:
                for _ in range(100):
                    try:
                        urllib.request.urlopen(f'http://127.0.0.1:{replica_port}/health',timeout=1).close();break
                    except OSError:time.sleep(.1)
                r=urllib.request.Request(f'http://127.0.0.1:{replica_port}/api/agent/chat',data=json.dumps({'message':'Restarted-process inheritance fixture'}).encode(),headers={'Content-Type':'application/json',**h(owner,seed)})
                with urllib.request.urlopen(r,timeout=20) as response:
                    assert json.load(response)['messages'][-1]['data']['preview']['inference']=='ollama'
            finally:
                replica.send_signal(signal.SIGINT);replica.wait(timeout=20)
        assert len(captured)==3 and all(auth=='Bearer '+key and model=='inherited-fixture' for _,auth,model in captured)
        req('/api/platform/ai',{'revision':written['revision'],'settings':settings,'keys':{'ollama':'denied'}},h(other),403,method='PUT')
        check('encrypted write-only keys and central model reach two independent shops; stale revisions and foreign saves rejected')
    finally:
        current=req('/api/platform/ai',headers=oh)
        save({'revision':current['revision'],'settings':original['settings'],'clearKeys':{'ollama':True}})
        sql("UPDATE platform_ai SET data='"+original_data.replace("'","''")+"'::jsonb WHERE id=true;")
        time.sleep(5.1)
        fixture.shutdown();fixture.server_close()
    for shop in [seed]:
        def change(state,revision,**extra):return req('/api/platform/shops/'+shop+'/status',{'status':state,'revision':revision,'reason':'Synthetic regression',**extra},oh)
        paused=change('paused',1)
        event=sql(f"INSERT INTO outbox(tenant,kind,data) VALUES('{shop}','platform.paused.fixture','{{}}') RETURNING id;").splitlines()[0]
        time.sleep(1.2)
        assert sql(f"SELECT delivered_at IS NULL FROM outbox WHERE id={int(event)}")=="t"
        req('/store-api/product',{}, {'x-tenant':shop},503)
        req('/api/search/product',{},h(owner,shop))
        req('/api/agent/chat',{'message':'must not run'},h(owner,shop),503)
        req('/api/platform/shops/'+shop+'/status',{'status':'active','revision':1,'reason':'stale'},oh,409)
        req('/api/platform/shops/'+shop+'/status',{'status':'archived','revision':paused['revision'],'reason':'missing confirmation'},oh,400)
        archived=change('archived',paused['revision'],confirmShopId=shop)
        req('/api/search/product',{},h(owner,shop),410)
        assert int(sql(f"SELECT count(*) FROM products WHERE tenant='{shop}'"))>0
        assert req('/api/platform/shops/'+shop,headers=oh)['status']=='archived'
        restored=change('active',archived['revision'])
        assert restored['status']=='active'
        for _ in range(30):
            if sql(f"SELECT delivered_at IS NOT NULL FROM outbox WHERE id={int(event)}")=="t":break
            time.sleep(.1)
        assert sql(f"SELECT delivered_at IS NOT NULL FROM outbox WHERE id={int(event)}")=="t"
        req('/store-api/product',{}, {'x-tenant':shop})
        req('/api/platform/shops/'+shop+'/status',{'status':'paused','revision':restored['revision'],'reason':'foreign'},h(other),403)
    check('pause blocks customer/AI actions; read-only merchant access survives; revision/confirmation guards protect recoverable trash and restoration')
    # Host selection uses actual middleware, without altering local/public DNS.
    def host(path,host,expected=200,extra=None):
        r=urllib.request.Request(base+path,headers={'Host':host,**(extra or {})})
        try:
            with urllib.request.urlopen(r) as response:status=response.status
        except urllib.error.HTTPError as e:status=e.code
        assert status==expected,(host,path,status)
    host('/health','admin.vendune.ai');host('/','admin.vendune.ai')
    host('/health',seed+'.vendune.ai')
    host('/health',seed+'.vendune.ai',400,{'x-tenant':other['workspace']})
    host('/health','unknown-'+seed+'.vendune.ai',404)
    for id in ['admin','app','api','www','mail','platform','invalid-']:
        req('/api/platform/shops',{'id':id,'name':'Reserved'},oh,400)
    check('admin service host and real tenant subdomains resolve; conflicting/unknown tenant hosts and reserved/dangling IDs rejected')
    # Wait only for the bounded telemetry flush; these are diagnostic counters, not commerce records.
    time.sleep(1.2)
    traffic=req('/api/platform/shops/'+seed,headers=oh)['traffic']
    assert any(r['channel']=='api' and r['timedCalls']>0 for r in traffic)
    assert all(r['totalMs']>=0 and r['maxMs']>=0 for r in traffic)
    check('persisted API latency uses measured-call counts, so historical unmeasured requests do not dilute averages')
