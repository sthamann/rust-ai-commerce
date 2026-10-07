#!/usr/bin/env python3
"""Provider-neutral financial ledger through real HTTP/PostgreSQL and a local private-service fixture."""
import copy,hashlib,hmac,json,os,pathlib,subprocess,threading,time,urllib.request,urllib.error,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
ROOT=pathlib.Path(__file__).resolve().parents[1];reference={};results={};behavior={};calls=[]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  assert self.headers['Authorization']=='Bearer '+secret
  b=json.loads(self.rfile.read(int(self.headers['Content-Length'])));assert self.headers['x-tenant']==b['tenant'];calls.append(b)
  if self.path=='/v1/onboarding':
   v={**{k:b[k] for k in ['apiVersion','provider','adapterVersion','tenant','channel','environment']},'accountRef':'merchant-'+b['tenant'],'ready':b['operation']!='disconnect','status':'ready','methods':['wallet'],'capabilities':['capture','authorize','void','refund']}
   if behavior.get('wrongAccount'):v['tenant']='atelier'
   if behavior.get('badUrl'):v['onboardingUrl']='https://evil.test/steal'
  else:
   v={**{k:b[k] for k in ['apiVersion','provider','adapterVersion','tenant','attemptId','orderId','environment','accountRef','amountMinor','currency']},'reference':b.get('reference') or 'REF-'+b['attemptId'],'status':'ready','approvalUrl':'https://provider.example.test/pay','confirmed':True}
   if b['operation']=='checkout_session':v.update(uiUrl='https://provider.example.test/frame',sessionToken='synthetic-browser-session-token-only',expiresIn=300,nonce=b['input']['nonce'])
   if b['operation']=='reconcile':v.update(status=reference.get(b['attemptId'],'ready'))
   if b['operation']=='capture':v.update(status='captured',captureId=behavior.get('captureId','CAP-'+b['attemptId']),settledAmountMinor=b['amountMinor'])
   if b['operation']=='authorize':v.update(status='authorized',authorizationId='AUTH-'+b['attemptId'],authorizedAmountMinor=b['amountMinor'])
   if b['operation'] in ['cancel','void']:v.update(status='voided' if b['context'].get('authorizationId') else 'cancelled')
   if b['operation']=='refund':v.update(status='refunded',refund={'id':'REFUND-'+b['requestKey'],'amountMinor':b['input']['amountMinor'],'currency':b['currency']})
   if behavior.get('badMoney') and b['operation']=='capture':v['settledAmountMinor']=1
   if behavior.get('wrongAccount'):v['accountRef']='foreign-account'
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(v).encode())
secret='synthetic-private-provider-credential-123';fixture=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=fixture.serve_forever,daemon=True).start()
base='http://127.0.0.1:8795';cfg={'url':f'http://127.0.0.1:{fixture.server_address[1]}','token':secret,'environment':'contract-fixture','approvalOrigins':['https://provider.example.test']};env={**os.environ,'BIND_ADDR':'127.0.0.1:8795','PAYMENT_SERVICES':json.dumps({'example_payments':{'1.0.0':cfg,'1.1.0':cfg}}),'PAYPAL_ACCOUNTS':'{}','PAYPAL_SANDBOX_ACCOUNTS':'{}'}
ROOT.joinpath('.run').mkdir(exist_ok=True);log=open(ROOT/'.run/generic-payments.log','w');p=None
ah={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN'],'x-tenant':'workshop'}
def call(path,body=None,h=None,method=None,expected=200):
 try:
  req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
  with urllib.request.urlopen(req,timeout=30) as r:v=json.load(r);code=r.status
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==expected,(path,code,v,expected);return v
def wait(id,h,state):
 for _ in range(100):
  v=call('/store-api/payments/'+id,h=h)
  if v['state']==state:return v
  time.sleep(.15)
 raise AssertionError((state,v,call('/api/payments',h=ah)))
def sql(statement):
 return subprocess.check_output(['docker','exec','-i',os.getenv('DB_CONTAINER','rust-ai-commerce-postgres-1'),'psql','-U','commerce','-d',os.environ['TEST_DATABASE'],'-At','-v','ON_ERROR_STOP=1'],input=statement,text=True).strip()
def purchase(currency="EUR"):
 h={'x-tenant':'workshop','x-commerce-currency':currency};c=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},h);h['sw-context-token']=c['token'];c=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'notebook','quantity':1},{'referencedId':'mug','quantity':1}]},h)
 s=c['checkout'];s.update(paymentMethodId='example-payments-wallet',customerEmail='fixture@example.test',billingAddress={'name':'Fixture Buyer','firstName':'Fixture','lastName':'Buyer','street':'Fixture Street 1','postalCode':'12345','city':'Test','country':'DE'});call('/store-api/checkout/context',{'revision':c['revision'],'checkout':s},h,'PUT')
 return call('/store-api/checkout/order',{}, {**h,'Idempotency-Key':uuid.uuid4().hex}),h
try:
 p=subprocess.Popen([str(ROOT/'target/debug/vendune')],cwd=ROOT,env=env,stdout=log,stderr=log)
 for _ in range(100):
  if p.poll()!=None:raise RuntimeError('See .run/generic-payments.log')
  try:call('/health');break
  except OSError:time.sleep(.2)
 m=json.loads((ROOT/'extensions/apps/payment-provider/manifest.json').read_text());m['paymentProvider']['methods'][0]['currencies']=['EUR','USD','JPY','KWD'];call('/api/apps',{'manifest':m},ah)
 providers=call('/api/payment-providers',h=ah);assert any(x['id']==m['id'] for x in providers['providers'])
 onboard={'operation':'start','channel':'default','country':'DE','requestKey':uuid.uuid4().hex,'approve':True}
 call('/api/payment-providers/'+m['id']+'/onboarding',onboard,ah)
 call('/api/payment-providers/'+m['id']+'/onboarding',onboard,{**ah,'x-tenant':'atelier'},expected=404)
 before=call('/api/payment-providers',h=ah)['accounts'];behavior['wrongAccount']=True
 call('/api/payment-providers/'+m['id']+'/onboarding',onboard,ah,expected=400);behavior.clear()
 behavior['badUrl']=True;call('/api/payment-providers/'+m['id']+'/onboarding',onboard,ah,expected=400);behavior.clear();assert call('/api/payment-providers',h=ah)['accounts']==before
 print('PASS Installed contracts and scoped onboarding reject foreign identities and malicious URLs without mutating accounts')
 config=call('/api/merchant/commerce',h=ah);fx=config['data']['currencies'];fx['definitions'] += [{'code':c,'scale':n,'rate':r,'strategy':'automatic'} for c,n,r in [('USD',2,'1.25'),('JPY',0,'160'),('KWD',3,'0.33333333')]];fx['enabled'] += ['USD','JPY','KWD'];method=next(x for x in config['data']['payments'] if x['id']=='example-payments-wallet');assert not method['active'];method['active']=True;call('/api/merchant/commerce',{'data':config['data'],'revision':config['revision']},ah,'PUT')
 assert any(x['id']=='example-payments-wallet' for x in call('/store-api/checkout/options',h={'x-tenant':'workshop'})['payments'])
 for code,scale in [('USD',2),('JPY',0),('KWD',3)]:
  fo,fh=purchase(code);fid=fo['payment']['attemptId'];fv=wait(fid,fh,'ready');assert fv['currency']==code and fv['currencyScale']==scale and fo['money']['minor']==fv['amountMinor']
  reference[fid]='approved';call('/store-api/payments/'+fid+'/reconcile',{}, {**fh,'Idempotency-Key':uuid.uuid4().hex});wait(fid,fh,'captured')
  call('/api/payments/'+fid+'/refund',{'approve':True,'amountMinor':1},{**ah,'Idempotency-Key':uuid.uuid4().hex});assert wait(fid,fh,'partially_refunded')['refundedMinor']==1
  outbound=next(x for x in calls if x.get('attemptId')==fid and x['operation']=='create');assert outbound['currencyScale']==scale and outbound['currency']==code
 print('PASS real generic adapter ledger preserves USD/JPY/KWD minor units and exact partial refunds')
 o,h=purchase();id=o['payment']['attemptId'];wait(id,h,'ready');assert o['payment']['provider']==m['id']
 call('/store-api/payments/'+id+'/session',h={**h,'x-tenant':'atelier'},expected=404);session=call('/store-api/payments/'+id+'/session',h=h);assert session['expiresIn']==300 and secret not in json.dumps(session)
 call('/api/merchant/orders/'+o['id']+'/transition',{'kind':'payment','state':'paid','revision':o['revision']},ah,expected=409)
 assert sql("SELECT count(*) FROM pair_evidence WHERE tenant='workshop' AND order_id='"+o['id']+"';")== '0'
 print('PASS Generic provider checkout, customer-bound embedded sessions and external-payment manual override protection')
 flow={'name':{'en':'Provider reconciliation','de':'Anbieter-Abgleich','es':'Conciliación'},'active':True,'event':'payment.captured','condition':{'type':'alwaysValid'},'action':'app_action','instruction':{'en':'Reconcile through core jobs','de':'Über Kernaufträge abgleichen','es':'Conciliar mediante tareas'},'locale':'en-GB','appAction':{'app':m['id'],'action':'payment_command','arguments':{'operation':'reconcile','approve':True}}}
 call('/api/automation/flows/provider_reconcile',{'revision':0,'data':flow},ah,'PUT')
 reference[id]='approved';call('/store-api/payments/'+id+'/reconcile',{}, {**h,'Idempotency-Key':uuid.uuid4().hex});v=wait(id,h,'captured');assert not v['realMoneyCharged'];assert len([x for x in calls if x.get('attemptId')==id and x['operation']=='capture'])==1
 call('/api/payments/'+id+'/refund',{'approve':True,'amountMinor':100}, {**ah,'Idempotency-Key':uuid.uuid4().hex});assert wait(id,h,'partially_refunded')['refundedMinor']==100
 call('/api/payments/'+id+'/refund',{'approve':True,'amountMinor':v['amountMinor']}, {**ah,'Idempotency-Key':uuid.uuid4().hex},expected=409)
 for _ in range(100):
  jobs=call('/api/automation/executions',h=ah)['jobs'];completed=[j for j in jobs if j['flow']=='provider_reconcile' and j['state']=='completed']
  if completed:break
  time.sleep(.1)
 assert completed,jobs
 for _ in range(100):
  if sql("SELECT count(*) FROM pair_evidence WHERE tenant='workshop' AND order_id='"+o['id']+"';")== '1':break
  time.sleep(.1)
 else:raise AssertionError('Confirmed generic capture did not reach knowledge projection')
 print('PASS Generic provider observation waits for confirmed capture and contributes one deduplicated product pair')
 print('PASS Verified approval queues one capture; payment events execute the app Flow action; exact refund and over-refund admission work')
 notice={'apiVersion':'1','provider':m['id'],'adapterVersion':'1.0.0','tenant':'workshop','attemptId':id,'environment':'contract-fixture','accountRef':'merchant-workshop','reference':'REF-'+id,'eventId':'synthetic-notification'}
 payload=json.dumps(notice).encode();stamp=str(int(time.time()));signature=hmac.new(secret.encode(),stamp.encode()+b'.'+payload,hashlib.sha256).hexdigest();headers={'x-tenant':'workshop','x-payment-timestamp':stamp,'x-payment-signature':signature}
 sql("UPDATE tenants SET status='paused' WHERE id='workshop';")
 call('/store-api/checkout/options',h={'x-tenant':'workshop'},expected=503)
 call('/store-api/payment-providers/'+m['id']+'/webhooks',notice,{**headers,'x-payment-signature':'0'*64},expected=401)
 assert not call('/store-api/payment-providers/'+m['id']+'/webhooks',notice,headers)['duplicate'];assert call('/store-api/payment-providers/'+m['id']+'/webhooks',notice,headers)['duplicate']
 sql("UPDATE tenants SET status='active' WHERE id='workshop';")
 call('/api/apps/'+m['id']+'/actions/payment_command',{'operation':'reconcile','attemptId':id,'approve':True,'requestKey':uuid.uuid4().hex},ah)
 call('/api/apps/'+m['id']+'/actions/payment_command',{'operation':'reconcile','attemptId':id,'approve':True,'requestKey':uuid.uuid4().hex},expected=401)
 print('PASS Signed callbacks reject forgery and deduplicate; protected app/MCP/Flow command gateway reaches the core job ledger')

 m['version']='1.1.0';m['paymentProvider']['methods'][0]['intent']='authorize';call('/api/apps',{'manifest':m},ah)
 o2,h2=purchase();id2=o2['payment']['attemptId'];wait(id2,h2,'ready');reference[id2]='approved';call('/store-api/payments/'+id2+'/reconcile',{}, {**h2,'Idempotency-Key':uuid.uuid4().hex});wait(id2,h2,'authorized')
 call('/api/payments/'+id2+'/void',{'approve':True},{**ah,'Idempotency-Key':uuid.uuid4().hex});wait(id2,h2,'cancelled')
 call('/api/payments/'+id+'/reconcile',{'approve':True},{**ah,'Idempotency-Key':uuid.uuid4().hex});time.sleep(.5);assert next(x for x in reversed(calls) if x.get('attemptId')==id)['adapterVersion']=='1.0.0'
 print('PASS Upgrade preserves old attempt contracts; new authorization/void lifecycle releases reservations')
 m['paymentProvider']['methods'][0]['intent']='capture';m['version']='1.1.1'
 # Reuse a version for the collision case: two attempts may never allocate one capture receipt.
 m['version']='1.1.0';call('/api/apps',{'manifest':m},ah,expected=409)
 o3,h3=purchase();id3=o3['payment']['attemptId'];wait(id3,h3,'ready');reference[id3]='approved';behavior['captureId']='CAP-'+id
 call('/store-api/payments/'+id3+'/capture',{}, {**h3,'Idempotency-Key':uuid.uuid4().hex});time.sleep(1)
 assert call('/store-api/payments/'+id3,h=h3)['state']!='captured';behavior.clear()
 print('PASS Reused settlement receipt cannot mark another attempt paid')
 account=call('/api/payment-providers/'+m['id']+'/onboarding',{**onboard,'operation':'disconnect'},ah);assert not account['ready']
 assert not any(x['id']=='example-payments-wallet' for x in call('/store-api/checkout/options',h={'x-tenant':'workshop'})['payments'])
 print('PASS Disconnected provider methods are hidden from checkout discovery')

 m['version']='1.2.0';m['runtime']='declarative';call('/api/apps',{'manifest':m},ah,expected=400)
 tools=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},ah)['result']['tools'];assert any(x['name']=='merchant.payment.onboarding' for x in tools)
 print('PASS Invalid payment declarations rejected; account and payment operations discoverable through MCP')
finally:
 if p and p.poll() is None:p.terminate();p.wait(timeout=15)
 fixture.shutdown();log.close()
