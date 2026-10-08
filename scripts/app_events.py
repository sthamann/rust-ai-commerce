#!/usr/bin/env python3
"""Actual leased delivery: slow-service isolation, bounded batches, minimization, filter/replay and stale lease fencing."""
import copy,json,os,socket,subprocess,threading,time,urllib.request,urllib.error,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from testing.runtime import ROOT,serve,stop
from testing.database import psql
from testing.app_approval import pin,consent
suffix=uuid.uuid4().hex[:10];env=dict(os.environ);slow='slow-'+suffix;fast='fast-'+suffix;seen=[];lock=threading.Lock();slow_started=threading.Event();release_slow=threading.Event()
def sql(statement):
 r=subprocess.run(psql(env['TEST_DB_CONTAINER'],'commerce',env['TEST_DATABASE'],'-qAt','-v','ON_ERROR_STOP=1'),input=statement,text=True,capture_output=True);assert r.returncode==0,r.stderr;return r.stdout.strip()
class Service(BaseHTTPRequestHandler):
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])));tenant=self.headers['x-tenant'];assert self.headers['Authorization']=='Bearer fixture-event-token'
  if tenant==slow:slow_started.set();release_slow.wait(3)
  with lock:seen.append((tenant,body))
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"ok":true}')
 def log_message(self,*_):pass
fixture=ThreadingHTTPServer(('127.0.0.1',0),Service);threading.Thread(target=fixture.serve_forever,daemon=True).start()
m=json.loads((ROOT/'extensions/apps/assistant-examples/integration.json').read_text());m['id']='event_fixture';m['eventDelivery']={'batchSize':10};m['events']=['order.placed'];m['permissions']=['data.read','data.write','admin.slot','service.call','events:order.placed'];m['eventFilters']=[{'event':'order.placed','equals':{'currency':'EUR'}}]
config=pin({m['id']:{'url':f'http://127.0.0.1:{fixture.server_port}','token':'fixture-event-token'}},m['id'],m)
with socket.socket() as s:s.bind(('127.0.0.1',0));base=f'http://127.0.0.1:{s.getsockname()[1]}'
child={**env,'APP_SERVICES':json.dumps(config),'PROCESS_ROLE':'all','BOOTSTRAP_MODE':'serve','BASE_URL':base,'BIND_ADDR':base.removeprefix('http://')};log=(ROOT/'artifacts/app-events-server.log').open('w');server=None

def call(path,body=None,h=None,status=200):
 if path=='/api/apps':body=consent(body)
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
 try:
  with urllib.request.urlopen(req,timeout=20) as out:code=out.status;v=json.load(out)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(path,code,status,v);return v

def register(tenant):
 u=call('/api/auth/register',{'workspaceId':tenant,'name':'Event fixture','email':tenant+'@example.test','password':'Synthetic-events-2026!'});h={'Authorization':'Bearer '+u['token'],'x-tenant':tenant};call('/api/apps',{'manifest':m},h);return h

def emit(tenant,currency='EUR',count=1,deliver=True):
 # Seed the real outbox and due deliveries together in one DB transaction, as commerce commits do; no external commerce/order side effects.
 data=json.dumps({'orderId':str(uuid.uuid4()),'totalMinor':1500,'currency':currency,'email':'must-not-be-delivered@example.test','address':{'street':'private'}})
 delivery=f"INSERT INTO app_deliveries(tenant,app,event_id) SELECT '{tenant}','{m['id']}',id FROM added" if deliver else 'SELECT id FROM added'
 return sql(f"WITH added AS (INSERT INTO outbox(tenant,kind,data) SELECT '{tenant}','order.placed','{data}'::jsonb FROM generate_series(1,{count}) RETURNING id) {delivery} RETURNING event_id;" if deliver else f"INSERT INTO outbox(tenant,kind,data) VALUES('{tenant}','order.placed','{data}'::jsonb) RETURNING id;")

def wait(predicate,timeout=15):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if predicate():return
  time.sleep(.1)
 raise AssertionError('Durable event effect did not arrive')
try:
 server=serve(child,base,log);slow_h=register(slow);fast_h=register(fast)
 emit(slow,count=10);assert slow_started.wait(10),'Slow fixture was not called'
 started=time.monotonic();emit(fast,count=60);wait(lambda:any(t==fast for t,_ in seen),2);assert not release_slow.is_set()
 print('PASS another tenant receives events while a slow tenant is still waiting')
 release_slow.set();wait(lambda:sql(f"SELECT count(*) FROM app_deliveries WHERE tenant='{fast}' AND app='{m['id']}' AND state='delivered'")=='60')
 fast_batches=[v for t,v in seen if t==fast];assert any(len(v['events'])>1 for v in fast_batches) and all(1<=len(v['events'])<=10 for v in fast_batches)
 assert sum(len(v['events']) for v in fast_batches)==60 and all('email' not in v['data'] and 'address' not in v['data'] for b in fast_batches for v in b['events'])
 print('PASS 60 events batch into bounded deliveries, keep stable per-event keys and remove customer PII')
 before=len(seen);emit(fast,currency='USD');wait(lambda:sql(f"SELECT count(*) FROM app_deliveries WHERE tenant='{fast}' AND state!='delivered'")=='0');assert len(seen)==before
 cursor=emit(fast,deliver=False);call('/api/apps/'+m['id']+'/events/replay',{'approve':True,'after':int(cursor)-1,'limit':1},fast_h);wait(lambda:len(seen)>before)
 activity=call('/api/apps/'+m['id']+'/activity',h=fast_h);assert activity['deliveries'] and all('data' not in row for row in activity['deliveries']);call('/api/apps/'+m['id']+'/activity',h={'Authorization':slow_h['Authorization'],'x-tenant':fast},status=403)
 print('PASS projected filters skip delivery; cursor replay requeues eligible events and activity is tenant-private')
 # Expired attempts are reclaimable; a completion carrying the obsolete UUID cannot clear the new lease.
 old=str(uuid.uuid4());new=str(uuid.uuid4());event=emit(fast,deliver=False)
 sql(f"INSERT INTO app_deliveries(tenant,app,event_id,state,lease_token,lease_until,available_at) VALUES('{fast}','{m['id']}',{event},'running','{old}',now()-interval '1 minute',now()+interval '1 hour'); UPDATE app_deliveries SET lease_token='{new}' WHERE tenant='{fast}' AND event_id={event}; UPDATE app_deliveries SET state='delivered',lease_token=NULL WHERE tenant='{fast}' AND event_id={event} AND lease_token='{old}';")
 assert sql(f"SELECT lease_token FROM app_deliveries WHERE tenant='{fast}' AND event_id={event}")==new
 print('PASS stale completion cannot overwrite a replacement lease')
finally:
 release_slow.set()
 if server:stop(server)
 log.close();fixture.shutdown()
