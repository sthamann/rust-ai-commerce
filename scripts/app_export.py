#!/usr/bin/env python3
"""Actual independent export app receives leased events, reads scoped products, uploads a private artifact and completes durable jobs."""
import copy,json,os,pathlib,socket,subprocess,time,urllib.request,urllib.error,uuid,sys,hashlib,hmac
from testing.runtime import ROOT,serve,stop
from testing.app_approval import consent,pin
sys.path.insert(0,str(ROOT/'extensions/sdk'))
from events import envelopes,verify_signature

def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
api,service=port(),port();base=f'http://127.0.0.1:{api}';tenant='export-'+uuid.uuid4().hex[:10];token=uuid.uuid4().hex
m=json.loads((ROOT/'extensions/apps/catalog-export/manifest.json').read_text());config={m['id']:{'url':f'http://127.0.0.1:{service}','token':token}};pin(config,m['id'],m)
env={**os.environ,'APP_SERVICES':json.dumps(config),'BIND_ADDR':f'127.0.0.1:{api}'}
def call(path,body=None,h=None):
 if path=='/api/apps' and body is not None:body=consent(body)
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
process=None;worker=None
try:
 with open(ROOT/'.run/app-export.log','wb') as log:process=serve(env,base,log)
 u=call('/api/auth/register',{'workspaceId':tenant,'name':'Export owner','email':tenant+'@example.test','password':'Synthetic-export-password!'});headers={'x-tenant':tenant,'Authorization':'Bearer '+u['token']}
 call('/api/apps',{'manifest':m},headers);prefix='/api/apps/'+m['id'];digest=next(p for p in call('/api/apps',h=headers)['packages'] if p['id']==m['id'])['digest']
 key=call(prefix+'/credentials',{'digest':digest,'approve':True,'permissions':['jobs.write','products.read','assets.read','assets.write'],'expiresInDays':1},headers)
 with open(ROOT/'.run/app-export-worker.log','wb') as log:worker=subprocess.Popen([sys.executable,str(ROOT/'extensions/apps/catalog-export/server.py')],env={**os.environ,'APP_TENANT':tenant,'APP_CALLBACK_KEY':key['key'],'APP_TOKEN':token,'COMMERCE_URL':base,'APP_PORT':str(service)},stdout=log,stderr=log)
 for _ in range(100):
  try:
   with socket.create_connection(('127.0.0.1',service),timeout=.1):break
  except OSError:time.sleep(.05)
 job=call(prefix+'/actions/export',{'ids':['mug','chair'],'productId':'mug'},{**headers,'Idempotency-Key':'real-example-export'})['jobId']
 for _ in range(100):
  entries=call(prefix+'/jobs',h=headers)['jobs'];entry=next(e for e in entries if e['id']==job)
  if entry['status']=='succeeded':break
  time.sleep(.1)
 else:raise AssertionError(entry)
 assert entry['progress']==100
 artifact=call(prefix+'/core/asset',{'id':entry['result']['assetId']},{**headers,'Authorization':'Bearer '+key['key']})
 import base64
 text=base64.b64decode(artifact['base64']).decode();assert 'mug' in text and 'chair' in text and 'productNumber' in text
 assets=call(prefix+'/core/assets',{'productId':'mug'},headers)['elements'];assert len(assets)==1 and not assets[0]['public']
 print('PASS actual leased event -> independent export worker -> scoped product reads -> native private file upload -> durable success and artifact read')
 raw=json.dumps({'events':[]}).encode();stamp='12345';event_key=hashlib.sha256(f'{tenant}:catalog_export:{raw.hex()}'.encode()).hexdigest();sign=hmac.new(b'fixture-secret',f'{tenant}\ncatalog_export\n{stamp}\n{event_key}\n{hashlib.sha256(raw).hexdigest()}'.encode(),hashlib.sha256).hexdigest();h={'x-tenant':tenant,'x-app-id':'catalog_export','x-app-timestamp':stamp,'x-app-event-id':event_key,'x-app-signature':sign}
 assert verify_signature(h,raw,'fixture-secret',tenant,'catalog_export',now=12345)==event_key
 for body,expected_t,now in [(raw+b'x',tenant,12345),(raw,'foreign',12345),(raw,tenant,13000)]:
  try:verify_signature(h,body,'fixture-secret',expected_t,'catalog_export',now=now);raise AssertionError('Invalid signature accepted')
  except ValueError:pass
 try:envelopes({'apiVersion':'1','tenant':tenant,'app':'catalog_export','events':[{'eventId':1,'tenant':tenant,'idempotencyKey':f'{tenant}:catalog_export:1','kind':'order.placed','data':{}},{'eventId':2,'tenant':'foreign','idempotencyKey':'bad','kind':'order.placed','data':{}}]},tenant,'catalog_export');raise AssertionError('Invalid batch accepted')
 except ValueError:pass
 print('PASS public webhook SDK rejects changed bytes, foreign context, expiry and mixed-tenant batches before effects')
finally:
 if worker is not None:stop(worker)
 if process is not None:stop(process)
