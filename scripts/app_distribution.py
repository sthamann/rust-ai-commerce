#!/usr/bin/env python3
"""Real signed publisher packages exercise canonical CLI signing, consent, dependency update/deactivation and tenant containment."""
import base64,copy,json,os,socket,subprocess,tempfile,urllib.request,urllib.error,uuid
from testing.runtime import ROOT,serve,stop
from testing.app_approval import consent
seed=base64.b64encode(bytes([7])*32).decode()
def signed(m):
 with tempfile.NamedTemporaryFile(mode='w',suffix='.json') as f:
  json.dump(m,f);f.flush()
  return json.loads(subprocess.check_output([str(ROOT/'target/debug/vendune'),'--sign-app',f.name],input=seed,text=True))
m=json.loads((ROOT/'extensions/apps/care-studio/manifest.json').read_text());m.update(id='fixture_base',version='1.0.0',distribution={'publisher':'fixture','keyId':'first','signature':'','channel':'stable','dependencies':[]})
v=signed(m);m=v['manifest']
with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}';env={**os.environ,'BIND_ADDR':f'127.0.0.1:{port}','APP_PUBLISHERS':json.dumps({'fixture':{'first':v['publicKey']}})}
def call(path,body=None,h=None,status=200,method=None):
 if path=='/api/apps' and body is not None:body=consent(body)
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;value=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;value=json.load(e)
 assert code==status,(path,code,status,value);return value
def owner():
 t='publisher-'+uuid.uuid4().hex[:10];u=call('/api/auth/register',{'workspaceId':t,'name':'Publisher fixture','email':t+'@example.test','password':'Synthetic-publisher-password!'})
 return {'x-tenant':t,'Authorization':'Bearer '+u['token']}
process=None
try:
 with open(ROOT/'.run/app-distribution.log','wb') as log:process=serve(env,base,log)
 h=owner();foreign=owner();call('/api/apps',{'manifest':m},h)
 altered=copy.deepcopy(m);altered['permissions'].append('customers.pii');call('/api/apps',{'manifest':altered},h,403)
 unsigned=copy.deepcopy(m);unsigned.pop('distribution');call('/api/apps',{'manifest':unsigned},h,403)
 dep=copy.deepcopy(m);dep['id']='fixture_child';dep['distribution']['dependencies']=[{'app':'fixture_base','publisher':'fixture','version':'^1.0.0'}];dep=signed(dep)['manifest']
 call('/api/apps',{'manifest':dep},foreign,409);call('/api/apps',{'manifest':dep},h)
 call('/api/apps/fixture_base',{'active':False,'revision':1},h,409,'PUT')
 major=copy.deepcopy(m);major['version']='2.0.0';major=signed(major)['manifest'];call('/api/apps',{'manifest':major},h,409)
 cycle=copy.deepcopy(m);cycle['version']='1.1.0';cycle['distribution']['dependencies']=[{'app':'fixture_child','publisher':'fixture','version':'^1.0.0'}];cycle=signed(cycle)['manifest'];call('/api/apps',{'manifest':cycle},h,409)
 update=copy.deepcopy(m);update['version']='1.1.0';update['distribution']['channel']='beta';update=signed(update)['manifest'];call('/api/apps',{'manifest':update},h)
 rows=call('/api/apps',h=h)['packages'];assert next(p for p in rows if p['id']=='fixture_base')['version']=='1.1.0'
 changed=copy.deepcopy(update);changed['distribution']['channel']='stable';call('/api/apps',{'manifest':changed},h,403)
 print('PASS real canonical signed packages reject modified rights/channel and unsigned namespace occupancy; dependencies require own-tenant signed versions and block deactivation, incompatible upgrade and cycles')
finally:
 if process is not None:stop(process)
