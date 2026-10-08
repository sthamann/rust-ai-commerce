#!/usr/bin/env python3
"""Encrypted tenant/app credentials and real incoming webhooks under strict non-owner RLS; synthetic local service only."""
from testing.app_approval import consent
import copy,hashlib,hmac,json,os,socket,subprocess,threading,time,urllib.request,urllib.error,urllib.parse,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from testing.runtime import ROOT,serve,stop
from testing.database import psql
from testing.app_approval import pin
suffix=uuid.uuid4().hex[:10];env=dict(os.environ);tenant='secret-'+suffix
role='appsecret_'+suffix;password=uuid.uuid4().hex;url=urllib.parse.urlsplit(env['DATABASE_URL']);owner=url.username or 'commerce';seen=[]
def sql(text):
 r=subprocess.run(psql(env['TEST_DB_CONTAINER'],owner,env['TEST_DATABASE'],'-qAt','-v','ON_ERROR_STOP=1'),input=text,text=True,capture_output=True);assert r.returncode==0,r.stderr;return r.stdout.strip()
class Service(BaseHTTPRequestHandler):
 def do_POST(self):
  seen.append(self.headers.get('Authorization'));self.rfile.read(int(self.headers['Content-Length']));self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"ok":true}')
 def log_message(self,*_):pass
service=ThreadingHTTPServer(('127.0.0.1',0),Service);threading.Thread(target=service.serve_forever,daemon=True).start()
m=json.loads((ROOT/'extensions/apps/assistant-examples/integration.json').read_text());next_m=copy.deepcopy(m);next_m['version']='0.1.1'
config={m['id']:{'url':f'http://127.0.0.1:{service.server_port}','token':'synthetic-old-operator-token'}};pin(config,m['id'],m);pin(config,m['id'],next_m)
with socket.socket() as s:s.bind(('127.0.0.1',0));base=f'http://127.0.0.1:{s.getsockname()[1]}'
def call(path,body=None,h=None,status=200,method=None,raw=None):
 if path == '/api/apps' and isinstance(body,dict) and ('manifest' in body or 'builtIn' in body): body=consent(body)
 r=urllib.request.Request(base+path,data=raw if raw is not None else None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method)
 try:
  with urllib.request.urlopen(r,timeout=20) as out:code=out.status;v=json.load(out)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(path,code,status,v);return v
webhook=json.loads((ROOT/'extensions/apps/assistant-examples/webhook.json').read_text());signing='synthetic-webhook-signing-'+suffix+'x'*32
def incoming(secret,key):
 raw=b'{"payload":{"reference":"fixture"}}';stamp=str(int(time.time()));canonical='\n'.join([tenant,webhook['id'],'incoming',stamp,key,hashlib.sha256(raw).hexdigest()]);headers={'x-app-timestamp':stamp,'x-app-event-id':key,'x-app-signature':hmac.new(secret.encode(),canonical.encode(),hashlib.sha256).hexdigest()};return raw,headers
sql(f"CREATE ROLE {role} LOGIN PASSWORD '{password}' NOSUPERUSER NOBYPASSRLS NOINHERIT; GRANT CONNECT,CREATE ON DATABASE {env['TEST_DATABASE']} TO {role}; GRANT USAGE,CREATE ON SCHEMA public TO {role}; GRANT SELECT,INSERT,UPDATE,DELETE,REFERENCES ON ALL TABLES IN SCHEMA public TO {role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO {role};")
child={**env,'DATABASE_RUNTIME_URL':urllib.parse.urlunsplit(url._replace(netloc=f'{role}:{password}@{url.hostname}:{url.port}')),'DB_RLS_REQUIRED':'true','BOOTSTRAP_MODE':'serve','PROCESS_ROLE':'http','APP_SERVICES':json.dumps(config),'BASE_URL':base,'BIND_ADDR':base.removeprefix('http://')}
log=(ROOT/'artifacts/app-secrets-server.log').open('w');server=None
try:
 server=serve(child,base,log)
 u=call('/api/auth/register',{'name':'Secret owner','email':suffix+'@example.test','password':'Synthetic-app-secrets-2026!','workspaceId':tenant});h={'Authorization':'Bearer '+u['token'],'x-tenant':tenant}
 call('/api/apps',{'manifest':m},h);call('/api/apps',{'manifest':webhook},h)
 metadata=call('/api/apps/'+m['id']+'/secrets',h=h);assert metadata['kinds']==['service'] and metadata['canManage'] and metadata['encryptionReady'];path='/api/apps/'+m['id']+'/secrets/service';token='synthetic-tenant-token-'+suffix+'x'*32
 call(path,{'digest':metadata['digest'],'approve':True,'revision':0,'secret':token},h,method='PUT')
 assert token not in json.dumps(call('/api/apps/'+m['id']+'/secrets',h=h))
 stored=sql(f"SELECT ciphertext FROM app_service_secrets WHERE tenant='{tenant}' AND app='{m['id']}'");assert token not in stored and len(stored)>50
 action=next(a['name'] for a in m['actions'] if a['handler']=='service');call('/api/apps/'+m['id']+'/actions/'+action,{'payload':{}},h);assert seen[-1]=='Bearer '+token
 call(path,{'digest':metadata['digest'],'approve':True,'revision':0,'secret':token},h,409,method='PUT')
 replacement='synthetic-rotated-token-'+suffix+'z'*32;call(path,{'digest':metadata['digest'],'approve':True,'revision':1,'secret':replacement},h,method='PUT');call('/api/apps/'+m['id']+'/actions/'+action,{'payload':{}},h);assert seen[-1]=='Bearer '+replacement
 foreign=call('/api/auth/register',{'name':'Other','email':'other'+suffix+'@example.test','password':'Synthetic-app-secrets-2026!','workspaceId':'foreignsecret-'+suffix});call(path,{'approve':True,'revision':2,'digest':metadata['digest'],'secret':replacement},{'Authorization':'Bearer '+foreign['token'],'x-tenant':tenant},403,method='PUT')
 call('/api/apps',{'manifest':next_m},h);n=len(seen);call('/api/apps/'+m['id']+'/actions/'+action,{'payload':{}},h,409);assert len(seen)==n
 metadata=call('/api/apps/'+m['id']+'/secrets',h=h);call(path,{'digest':metadata['digest'],'approve':True,'revision':2,'secret':replacement},h,method='PUT')
 print('PASS real strict-RLS service calls use encrypted tenant secrets, rotation/CAS, digest consent and foreign rejection; plaintext is never returned')
 wh=call('/api/apps/'+webhook['id']+'/secrets',h=h);wp='/api/apps/'+webhook['id']+'/secrets/webhook';call(wp,{'digest':wh['digest'],'approve':True,'revision':0,'secret':signing},h,method='PUT')
 route='/webhooks/apps/'+tenant+'/'+webhook['id']+'/incoming';raw,headers=incoming(signing,'first');accepted=call(route,h=headers,raw=raw);assert accepted['accepted'];replayed=call(route,h=headers,raw=raw);assert replayed["replayed"] and replayed["eventId"]==accepted["eventId"]
 raw,headers=incoming('wrong-key-'+'x'*40,'wrong');call(route,h=headers,raw=raw,status=401)
 raw,headers=incoming(signing,'conflict');call(route,h={**headers,'x-tenant':'atelier'},raw=raw,status=400)
 new_signing='synthetic-rotated-webhook-'+suffix+'y'*32;call(wp,{'digest':wh['digest'],'approve':True,'revision':1,'secret':new_signing},h,method='PUT');raw,headers=incoming(signing,'revoked');call(route,h=headers,raw=raw,status=401);raw,headers=incoming(new_signing,'second');assert call(route,h=headers,raw=raw)['accepted']
 sql(f"UPDATE tenants SET status='paused' WHERE id='{tenant}'");raw,headers=incoming(new_signing,'paused');call(route,h=headers,raw=raw,status=503)
 print('PASS signed incoming webhook adopts path tenant under strict RLS, rejects conflicting context/revoked signatures and stops a paused shop')
finally:
 if server:stop(server)
 log.close();service.shutdown();sql(f'DROP OWNED BY {role}; DROP ROLE {role};')
