#!/usr/bin/env python3
"""Actual Rust/PostgreSQL multi-process notification, OAuth/import and adversarial fixtures; no external accounts."""
import base64,concurrent.futures,hashlib,json,os,pathlib,signal,socket,sqlite3,subprocess,sys,tempfile,threading,time,urllib.parse,uuid
from cryptography.fernet import Fernet
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from email_tests import http,SMTP,Contracts
from testing.runtime import ROOT,serve,stop

def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def wait(fn):
 for _ in range(160):
  try: value=fn()
  except OSError: value=False
  if value:return value
  time.sleep(.1)
 raise AssertionError('Timed out waiting for actual worker result')
def sql(query):
 result=subprocess.run(['docker','exec','-i',os.getenv('DB_CONTAINER','vendune-postgres-1'),'psql','-X','-q','-At','-U','commerce','-d',os.environ['TEST_DATABASE'],'-v','ON_ERROR_STOP=1'],input=query,text=True,capture_output=True)
 assert result.returncode==0,result.stderr
 return result.stdout.strip()
class Wire(BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def do_GET(self):self.respond()
 def do_POST(self):self.respond()
 def respond(self):
  body=self.rfile.read(int(self.headers.get('Content-Length',0)))
  self.server.calls.append((self.path,body,dict(self.headers)))
  path=urllib.parse.urlsplit(self.path).path
  code=200;value={}
  if path.endswith('/emails') or path.endswith('/mail/send'):
   key=self.headers.get('Idempotency-Key','');mode=json.loads(body).get('subject','')
   code=429 if mode=='rate-limit' else 503 if mode=='ambiguous' else 200
   value={'id':'wire-receipt'}
  elif path.endswith('/token'):
   value={'access_token':'synthetic-access','refresh_token':'synthetic-refresh','scope':'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/analytics.readonly','expires_in':3600}
  elif path.endswith('/oauth.v2.access'):
   value={'ok':True,'access_token':'synthetic-slack','scope':'chat:write,channels:read,groups:read'}
  elif path.endswith('/chat.postMessage'):value={'ok':True,'channel':'C12345678','ts':'42.1'}
  elif path.endswith('/conversations.list'):value={'ok':True,'channels':[{'id':'C12345678','name':'orders','is_member':True}]}
  elif path.endswith('/profile'):value={'historyId':'100'}
  elif path.endswith('/history'):value={'historyId':'101','history':[]}
  elif path.endswith('/labels'):value={'labels':[{'id':'INBOX','name':'Inbox'}]}
  elif path.endswith('/messages'):value={'messages':[{'id':'mail1'}]}
  elif path.endswith('/messages/mail1'):
   value={'id':'mail1','threadId':'thread1','labelIds':['INBOX'],'payload':{'mimeType':'text/plain','headers':[{'name':'Subject','value':'Support RAC-42'},{'name':'From','value':'buyer@example.test'}],'body':{'data':base64.urlsafe_b64encode(b'Please help with RAC-42').decode()}}}
  elif path.endswith(':runReport'):
   value={'rowCount':1,'rows':[{'dimensionValues':[{'value':'tee'},{'value':'Tee'}],'metricValues':[{'value':'3'},{'value':'2'},{'value':'1'},{'value':'9.99'}]}]}
  raw=json.dumps(value).encode();self.send_response(code);self.send_header('Content-Length',str(len(raw)));self.send_header('Retry-After','1');self.end_headers();self.wfile.write(raw)

with tempfile.TemporaryDirectory(prefix='vendune-rust-connectors-') as directory:
 Contracts.setUpClass()
 services=[];logs=[];core=None;runtime_role=None;provider=ThreadingHTTPServer(('127.0.0.1',0),Wire);provider.calls=[]
 threading.Thread(target=provider.serve_forever,daemon=True).start()
 try:
  gateway='fixture-gateway-'+uuid.uuid4().hex;key=base64.urlsafe_b64encode(bytes([7])*32).decode();p1,p2=port(),port();base='http://127.0.0.1:'+str(port());origin='http://127.0.0.1:'+str(provider.server_port)
  mappings={a:{'url':f'http://127.0.0.1:{p1}/{a}','token':gateway} for a in ('email','gmail','google_analytics','slack')}
  env={**os.environ,'BIND_ADDR':base.removeprefix('http://'),'APP_SERVICES':json.dumps(mappings),'PROCESS_ROLE':'all'}
  log=open(directory+'/core.log','w');logs.append(log);core=serve(env,base,log)
  ce={**env,'CONNECTOR_GATEWAY_TOKEN':gateway,'CONNECTOR_SECRET_KEY':key,'CONNECTOR_DATABASE_URL':env['DATABASE_URL'],'CONNECTOR_PUBLIC_URL':f'http://127.0.0.1:{p1}','GOOGLE_CLIENT_ID':'synthetic-google','GOOGLE_CLIENT_SECRET':'synthetic-secret','SLACK_CLIENT_ID':'synthetic-slack','SLACK_CLIENT_SECRET':'synthetic-secret','CONNECTOR_TEST_ENDPOINTS':json.dumps({n:origin+('/token' if n=='google_token' else '/oauth.v2.access' if n=='slack_token' else '/global' if n=='sendgrid' else '/eu' if n=='sendgrid_eu' else '') for n in ('resend','sendgrid','sendgrid_eu','google_token','gmail','analytics','slack','slack_token')}),'CONNECTOR_TENANT_DAILY':'20','EMAIL_TEST_SMTP':'1','EMAIL_TLS_CA_FILE':Contracts.folder.name+'/ca.pem'}
  unsafe=subprocess.run([str(ROOT/'target/debug/connectors'),'--import-legacy'],input=json.dumps({'format':1,'configs':[],'jobs':[],'sources':[],'changes':[]}),text=True,env={**ce,'DB_RLS_REQUIRED':'true'},capture_output=True)
  assert unsafe.returncode!=0
  runtime_role='connector_runtime_'+uuid.uuid4().hex[:10];password=uuid.uuid4().hex
  sql(f"CREATE ROLE {runtime_role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '{password}'; GRANT USAGE ON SCHEMA public TO {runtime_role}; GRANT SELECT ON tenants,commerce_migrations TO {runtime_role}; GRANT SELECT,INSERT,UPDATE,DELETE ON connector_config,connector_limits,connector_jobs,connector_oauth,connector_sources,connector_changes TO {runtime_role}; GRANT USAGE,SELECT,UPDATE ON SEQUENCE connector_changes_seq_seq TO {runtime_role};")
  db=urllib.parse.urlsplit(env['DATABASE_URL']);ce['CONNECTOR_DATABASE_URL']=urllib.parse.urlunsplit(db._replace(netloc=f'{runtime_role}:{password}@{db.hostname}:{db.port}'));ce['DB_RLS_REQUIRED']='true'
  sql(f'GRANT TRUNCATE ON connector_jobs TO {runtime_role};')
  unsafe=subprocess.run([str(ROOT/'target/debug/connectors'),'--import-legacy'],input=json.dumps({'format':1,'configs':[],'jobs':[],'sources':[],'changes':[]}),text=True,env=ce,capture_output=True)
  assert unsafe.returncode!=0
  sql(f'REVOKE TRUNCATE ON connector_jobs FROM {runtime_role};')
  for p in (p1,p2):
   log=open(directory+f'/service-{p}.log','w');logs.append(log)
   process=subprocess.Popen([str(ROOT/'target/debug/connectors')],env={**ce,'CONNECTOR_PORT':str(p)},stdout=log,stderr=log);services.append(process)
   wait(lambda: http(f'http://127.0.0.1:{p}/health') if process.poll() is None else False)
  shops=[]
  for i in range(2):
   t='rust-mail-'+uuid.uuid4().hex[:10];user=http(base+'/api/auth/register',{'email':t+'@example.test','password':'Synthetic-fixture-2026!','name':'Fixture','workspaceId':t,'workspaceName':'Rust mail'})
   shops.append((user['workspace'],{'Authorization':'Bearer '+user['token'],'x-tenant':user['workspace']}))
  t,h=shops[0];other,oh=shops[1]
  def call(app,name,v={},headers=h,expected=200):return http(base+f'/api/apps/{app}/actions/{name}',v,headers,expected=expected)
  for a in mappings:http(base+'/api/apps',{'builtIn':a},h)
  http(base+'/api/apps',{'builtIn':'email'},oh)
  direct={'Authorization':'Bearer '+gateway,'x-tenant':t}
  http(f'http://127.0.0.1:{p1}/email/actions/status',{},expected=401)
  status=call('email','status');assert status['revision']==0 and not status['settings']['enabled']
  settings={**status['settings'],'provider':'resend','enabled':True,'dryRun':False,'fromEmail':'shop@example.test','fromName':'Rust Shop'}
  call('email','configure',{'revision':0,'settings':settings,'credentials':{'apiKey':'synthetic-private-api'}})
  assert not call('email','status',headers=oh)['credentialsConfigured']['apiKey']
  assert 'synthetic-private-api' not in json.dumps(call('email','status'))
  assert sql(f"SELECT position(convert_to('synthetic-private-api','UTF8') in data) FROM connector_config WHERE tenant='{t}' AND app='email';")=='0'
  def send(key,subject='hello'):
   return http(f'http://127.0.0.1:{p1 if int(key[-1],16)%2 else p2}/email/actions/send',{'requestKey':key,'message':{'to':'buyer@example.test','bcc':'audit@example.test','subject':subject,'text':'Fixture'}},direct)
  with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:list(pool.map(lambda _:send('race-1'),range(12)))
  wait(lambda:call('email','status')['jobs'][0]['state']=='completed')
  assert len([c for c in provider.calls if c[0]=='/emails'])==1
  http(f'http://127.0.0.1:{p1}/email/actions/send',{'requestKey':'race-1','message':{'to':'buyer@example.test','subject':'changed','text':'Fixture'}},direct,expected=409)
  send('ambiguous-2','ambiguous');wait(lambda:any(j['id']=='ambiguous-2' and j['state']=='uncertain' for j in call('email','status')['jobs']))
  count=len(provider.calls);time.sleep(1);assert len(provider.calls)==count
  send('rate-3','rate-limit');wait(lambda:any(j['id']=='rate-3' and j['attempts']>=2 for j in call('email','status')['jobs']))
  sql(f"UPDATE connector_jobs SET state='running',lease_id='00000000-0000-0000-0000-000000000001',lease_until=now()+interval '120 seconds' WHERE tenant='{t}' AND id='rate-3';")
  time.sleep(.4);assert sql(f"SELECT state FROM connector_jobs WHERE tenant='{t}' AND id='rate-3';")=='running'
  sql(f"UPDATE connector_jobs SET lease_until=now()-interval '1 second' WHERE tenant='{t}' AND id='rate-3';")
  wait(lambda:sql(f"SELECT state FROM connector_jobs WHERE tenant='{t}' AND id='rate-3';")=='uncertain')
  # Both SendGrid regions preserve the provider contract and recipient privacy.
  for region,key in [('global','sendgrid-7'),('eu','sendgrid-8')]:
   settings.update(provider='sendgrid',region=region)
   current=call('email','status');call('email','configure',{'revision':current['revision'],'settings':settings,'credentials':{'apiKey':'synthetic-sendgrid'}})
   send(key);wait(lambda:any(j['id']==key and j['state']=='completed' for j in call('email','status')['jobs']))
  grid=[json.loads(body) for path,body,_ in provider.calls if path.endswith('/mail/send')]
  assert {'/global/mail/send','/eu/mail/send'} <= {path for path,_,_ in provider.calls}
  assert len(grid)==2 and all(v['personalizations'][0]['bcc']==[{'email':'audit@example.test'}] for v in grid)
  # Hold admission deterministically; changing configuration must fence a queued send.
  sql(f"UPDATE connector_limits SET minute=date_trunc('minute',now()),dispatched=120 WHERE tenant='{t}' AND app='email';")
  send('stale-9');assert sql(f"SELECT state FROM connector_jobs WHERE tenant='{t}' AND id='stale-9';")=='queued'
  settings['fromName']='Updated Rust Shop';current=call('email','status')
  call('email','configure',{'revision':current['revision'],'settings':settings})
  before_calls=len(provider.calls)
  sql(f"UPDATE connector_limits SET dispatched=0 WHERE tenant='{t}' AND app='email';")
  wait(lambda:any(j['id']=='stale-9' and j['state']=='failed' for j in call('email','status')['jobs']))
  assert len(provider.calls)==before_calls
  # Actual OAuth callback, state reuse and source exports run against Rust, not the archived oracle.
  for app in ('gmail','google_analytics','slack'):
   v=call(app,'connect');state=urllib.parse.parse_qs(urllib.parse.urlsplit(v['authorizationUrl']).query)['state'][0]
   callback=f'http://127.0.0.1:{p1}/oauth/callback?state={state}&code=fixture-code'
   http(callback);http(callback,expected=400)
   cfg={'labelId':'INBOX'} if app=='gmail' else {'propertyId':'1234','measurementId':'G-TEST1234'} if app=='google_analytics' else {'channelId':'C12345678','notifyOrders':False}
   call(app,'configure',{'revision':1,'settings':cfg})
   if app=='slack':
    assert call(app,'channels')['channels'][0]['id']=='C12345678';call(app,'post_order',{'requestKey':'slack-1','event':{'orderId':'RAC-42','totalPrice':12.5}})
    wait(lambda:call(app,'status')['jobs'][0]['state']=='completed')
   else:
    call(app,'sync',{'requestKey':'sync-1'});wait(lambda:call(app,'status')['jobs'][0]['state']=='completed')
    data=http(f'http://127.0.0.1:{p1}/{app}/exports',{'cursor':0},direct);assert data['sources']
    foreign=http(f'http://127.0.0.1:{p1}/{app}/exports',{'cursor':0},{**direct,'x-tenant':other});assert not foreign['sources']
  assert 'RAC-42' in json.dumps(http(f'http://127.0.0.1:{p1}/gmail/exports',{'cursor':0},direct))
  wait(lambda:'Support RAC-42' in json.dumps(http(base+'/api/knowledge/external',headers=h)))
  assert not http(base+'/api/knowledge/external',headers=oh)['elements']
  evidence=http(base+'/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'knowledge.external','arguments':{'query':'RAC-42'}}},h)
  assert 'RAC-42' in json.dumps(evidence)
  # Actual Rust STARTTLS, implicit TLS and lost DATA-acceptance outcomes.
  for implicit,security in [(False,'starttls'),(True,'tls')]:
   Contracts.smtp.implicit=implicit
   settings.update(provider='smtp',smtpHost='localhost',smtpPort=Contracts.smtp.server_address[1],smtpSecurity=security)
   current=call('email','status');call('email','configure',{'revision':current['revision'],'settings':settings})
   key='smtp-'+('5' if implicit else '4');send(key)
   wait(lambda:any(j['id']==key and j['state']=='completed' for j in call('email','status')['jobs']))
  assert len(Contracts.smtp.messages)==2
  assert all(b'Bcc:' not in raw for _,raw in Contracts.smtp.messages)
  Contracts.smtp.drop_after_data=True
  send('smtp-lost-6');wait(lambda:any(j['id']=='smtp-lost-6' and j['state']=='uncertain' for j in call('email','status')['jobs']))
  count=len(Contracts.smtp.messages);time.sleep(.4);assert len(Contracts.smtp.messages)==count
  Contracts.smtp.drop_after_data=False
  # Seventeen capacity-exhausted tenants must not hide another tenant behind the claim page.
  for i in range(17):
   noisy='aaa-noise-'+uuid.uuid4().hex[:10]
   http(base+'/api/auth/register',{'email':noisy+'@example.test','password':'Synthetic-fixture-2026!','name':'Fixture','workspaceId':noisy,'workspaceName':'Noisy fixture'})
   sql(f"INSERT INTO connector_limits(tenant,app) VALUES('{noisy}','email'); INSERT INTO connector_jobs(tenant,app,id,fingerprint,state,payload,lease_until) VALUES('{noisy}','email','one','fixture','running',''::bytea,now()+interval '120 seconds'),('{noisy}','email','two','fixture','running',''::bytea,now()+interval '120 seconds'),('{noisy}','email','waiting','fixture','queued',''::bytea,NULL);")
  # Offline import is atomic, preserves cursors and does not replay an old in-flight send.
  legacy={'format':1,'configs':[{'tenant':other,'app':'email','value':{'revision':4,'settings':settings,'credentials':{}}}],
          'jobs':[{'tenant':other,'app':'email','id':'legacy-flight','payload':{'mail':{'fixture':True}},'state':'running','attempts':1,'available':time.time(),'result':None}],
          'sources':[{'tenant':other,'app':'gmail','id':'old-source','value':{'id':'old-source','text':'original'}}],
          'changes':[{'seq':10000,'tenant':other,'app':'gmail','value':{'id':'old-source','text':'original'}}]}
  legacy['jobs'].append({'tenant':other,'app':'email','id':'legacy-pending','payload':{'mail':{'to':['buyer@example.test'],'cc':[],'bcc':[],'subject':'Original queued mail','text':'Fixture','html':'','replyTo':'','fromEmail':'shop@example.test','fromName':'Rust Shop'},'revision':4,'dryRun':True,'fingerprint':'original-legacy-digest'},'state':'queued','attempts':0,'available':time.time(),'result':None})
  # Run the real readonly SQLite/Fernet export utility, not just the Rust stdin importer.
  source=pathlib.Path(directory)/'old-state.sqlite';cipher=Fernet(ce['CONNECTOR_SECRET_KEY'].encode())
  def sealed(row):return cipher.encrypt(json.dumps({'tenant':row['tenant'],'app':row['app'],'value':row['value']}).encode()).decode()
  with sqlite3.connect(source) as old:
   old.executescript('CREATE TABLE config(tenant TEXT,app TEXT,data TEXT); CREATE TABLE jobs(tenant TEXT,app TEXT,id TEXT,state TEXT,payload TEXT,result TEXT,available REAL,attempts INTEGER); CREATE TABLE sources(tenant TEXT,app TEXT,id TEXT,data TEXT); CREATE TABLE changes(seq INTEGER,tenant TEXT,app TEXT,data TEXT);')
   for row in legacy['configs']:old.execute('INSERT INTO config VALUES(?,?,?)',(row['tenant'],row['app'],sealed(row)))
   for row in legacy['jobs']:old.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)',(row['tenant'],row['app'],row['id'],row['state'],sealed({**row,'value':row['payload']}),None,row['available'],row['attempts']))
   for row in legacy['sources']:old.execute('INSERT INTO sources VALUES(?,?,?,?)',(row['tenant'],row['app'],row['id'],sealed(row)))
   for row in legacy['changes']:old.execute('INSERT INTO changes VALUES(?,?,?,?)',(row['seq'],row['tenant'],row['app'],sealed(row)))
  before=hashlib.sha256(source.read_bytes()).hexdigest()
  imported=subprocess.run([sys.executable,str(ROOT/'scripts/migrate_connector_state.py'),str(source)],text=True,env=ce,capture_output=True)
  assert imported.returncode==0,imported.stderr
  assert hashlib.sha256(source.read_bytes()).hexdigest()==before
  assert call('email','status',headers=oh)['revision']==4
  wait(lambda:any(j['id']=='legacy-pending' and j['state']=='completed' for j in call('email','status',headers=oh)['jobs']))
  assert any(j['id']=='legacy-flight' and j['state']=='uncertain' for j in call('email','status',headers=oh)['jobs'])
  assert http(f'http://127.0.0.1:{p1}/gmail/exports',{'cursor':0},{**direct,'x-tenant':other})['cursor']==10000
  repeated=subprocess.run([str(ROOT/'target/debug/connectors'),'--import-legacy'],input=json.dumps(legacy),text=True,env=ce,capture_output=True)
  assert repeated.returncode!=0
  assert call('email','status',headers=oh)['revision']==4
  role='connector_probe_'+uuid.uuid4().hex[:8]
  sql(f'CREATE ROLE {role} NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO {role}; GRANT SELECT,UPDATE ON connector_config,connector_jobs TO {role};')
  try:
   assert sql(f'BEGIN; SET LOCAL ROLE {role}; SELECT count(*) FROM connector_config; ROLLBACK;')=='0'
   rows=sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('rac.tenant','{other}',true); SELECT count(*) FROM connector_config WHERE tenant='{t}'; UPDATE connector_config SET data='x'::bytea WHERE tenant='{t}'; ROLLBACK;").splitlines();assert rows[-1]=='0'
  finally:sql(f'DROP OWNED BY {role}; DROP ROLE {role};')
  # Daily quota is transactional across service instances; idempotent replay consumes no extra quota.
  used=int(sql(f"SELECT enqueued FROM connector_limits WHERE tenant='{t}' AND app='email';"))
  for i in range(20-used):send(f'quota-{i:x}')
  http(f'http://127.0.0.1:{p1}/email/actions/send',{'requestKey':'over-quota','message':{'to':'buyer@example.test','subject':'hi','text':'Fixture'}},direct,expected=429)
  assert sql(f"SELECT enqueued FROM connector_limits WHERE tenant='{t}' AND app='email';")=='20'
  send('quota-0')
  print('PASS Rust multi-process delivery: idempotency, uncertainty, leases, quotas, encrypted config, OAuth, Gmail/GA4/Slack, exports and non-superuser RLS')
 finally:
  for process in services:
   if process.poll() is None:process.send_signal(signal.SIGINT)
  for process in services:process.wait(timeout=70)
  if core is not None:stop(core)
  if runtime_role:sql(f'DROP OWNED BY {runtime_role}; DROP ROLE {runtime_role};')
  provider.shutdown();provider.server_close()
  Contracts.tearDownClass()
  for log in logs:log.close()
