#!/usr/bin/env python3
"""Standalone app process, opaque UI SDK transport, own SQLite inbox and independent durable worker."""
import json,os,pathlib,socket,sqlite3,subprocess,tempfile,time,urllib.request,urllib.error,uuid
ROOT=pathlib.Path(__file__).resolve().parents[1];checks=[]
def port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
service_port=port();api_port=port();base=f'http://127.0.0.1:{api_port}';app_id='service_'+uuid.uuid4().hex[:12];token=uuid.uuid4().hex
processes=[];logs=[]
def start(cmd,env,name):
    log=open(ROOT/'.run'/name,'w');logs.append(log)
    p=subprocess.Popen(cmd,cwd=ROOT,env={**os.environ,**env},stdout=log,stderr=log);processes.append(p);return p
def call(path,body=None,h=None,expected=200):
    r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
    try:
        with urllib.request.urlopen(r,timeout=20) as res:code=res.status;v=json.load(res)
    except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
    assert code==expected,(path,code,v);return v
def passed(name):checks.append(name);print('PASS',name)
with tempfile.TemporaryDirectory() as directory:
    db=str(pathlib.Path(directory)/'inbox.sqlite');config={app_id:{'url':f'http://127.0.0.1:{service_port}','uiUrl':f'http://127.0.0.1:{service_port}/','token':token}}
    env={'APP_SERVICES':json.dumps(config),'PROCESS_ROLE':'http','BIND_ADDR':f'127.0.0.1:{api_port}'}
    try:
        start(['python3',str(ROOT/'extensions/apps/service-example/server.py')],{'APP_PORT':str(service_port),'APP_TOKEN':token,'APP_DB':db},'service-example-test.log')
        start([str(ROOT/'target/debug/rust-ai-commerce')],env,'service-api-test.log')
        for _ in range(80):
            try:call('/health');break
            except OSError:time.sleep(.25)
        u=call('/api/auth/register',{'email':uuid.uuid4().hex+'@example.test','name':'Service Test','password':'Synthetic-service-account-2026!','workspaceId':'svc-'+uuid.uuid4().hex[:12],'workspaceName':'Synthetic service shop'})
        h={'Authorization':'Bearer '+u['token'],'x-tenant':u['workspace']};manifest=json.loads((ROOT/'extensions/apps/service-example/manifest.json').read_text());manifest['id']=app_id
        call('/api/apps',{'manifest':manifest},h)
        call(f'/api/apps/{app_id}/entities/notes',{'id':'one','fields':{'title':'Tenant-scoped app note'}},h)
        result=call(f'/api/apps/{app_id}/actions/availability',{'sku':'mug'},h);assert result['available'] and 'synthetic' in result['source']
        mcp=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':f'app.{app_id}.availability','arguments':{'sku':'mug'}}},h);assert mcp['result']['structuredContent']==result
        call(f'/api/apps/{app_id}/actions/availability',{'sku':'mug'},{'x-tenant':u['workspace']},401)
        passed('External service action is shared by HTTP/MCP and requires merchant permission')
        packages=call('/api/apps',h=h);assert token not in json.dumps(packages) and next(p for p in packages['packages'] if p['id']==app_id)['uiUrl']==config[app_id]['uiUrl']
        with urllib.request.urlopen(f'http://127.0.0.1:{service_port}/sdk.js') as r:assert r.headers['Access-Control-Allow-Origin']=='*' and 'connectCommerce' in r.read().decode()
        passed('Operator UI URL is exposed without service secrets; opaque-origin SDK import has CORS')
        ch={'x-tenant':u['workspace']};cart=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},ch);ch['sw-context-token']=cart['token']
        call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},ch)
        order=call('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':uuid.uuid4().hex})
        time.sleep(.8)
        with sqlite3.connect(db) as conn:assert conn.execute('SELECT count(*) FROM events').fetchone()[0]==0
        start([str(ROOT/'target/debug/rust-ai-commerce')],{**env,'PROCESS_ROLE':'memory-worker'},'service-memory-worker-test.log')
        worker=start([str(ROOT/'target/debug/rust-ai-commerce')],{**env,'PROCESS_ROLE':'app-worker'},'service-worker-test.log')
        for _ in range(80):
            with sqlite3.connect(db) as conn:rows=conn.execute('SELECT tenant,event_key,data FROM events').fetchall()
            if rows:break
            time.sleep(.25)
        assert len(rows)==1 and rows[0][0]==u['workspace'] and json.loads(rows[0][2])['data']['orderId']==order['id']
        passed('Separate app worker consumes queued order event into app-owned durable SQLite storage')
        worker.terminate();worker.wait(15)
        start([str(ROOT/'target/debug/rust-ai-commerce')],{**env,'PROCESS_ROLE':'app-worker'},'service-worker-restart-test.log')
        request=urllib.request.Request(f'http://127.0.0.1:{service_port}/events',data=rows[0][2].encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'x-tenant':u['workspace']})
        with urllib.request.urlopen(request) as r:assert json.load(r)['duplicate']
        time.sleep(.8)
        with sqlite3.connect(db) as conn:assert conn.execute('SELECT count(*) FROM events').fetchone()[0]==1
        passed('App inbox survives worker restart and deduplicates repeated event delivery')
        report={'passed':len(checks),'checks':checks,'processIsolation':'separate process; no microVM claim'}
        if os.getenv('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report))
    finally:
        for p in reversed(processes):
            if p.poll() is None:p.terminate();p.wait(15)
        for log in logs:log.close()
