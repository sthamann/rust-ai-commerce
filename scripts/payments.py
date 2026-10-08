#!/usr/bin/env python3
"""PayPal wire-contract and real Rust/PostgreSQL state tests. Local fixture, never real provider traffic."""
from testing.app_approval import consent
import copy,json,os,pathlib,subprocess,threading,time,urllib.request,urllib.error,uuid,concurrent.futures
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
ROOT=pathlib.Path(__file__).resolve().parents[1];checks=[];orders={};keys={};captures=[];refunds=[];pending_refunds={};bn_seen=[];behavior={'lostCapture':False,'badAmount':False,'pendingRefund':False};gate=threading.Lock()
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def answer(self,code,v):self.send_response(code);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(v).encode())
    def do_GET(self):
        bn=self.headers.get('PayPal-Partner-Attribution-Id');assert bn=='Vendune_Fixture_Only';bn_seen.append(bn)
        id=self.path.rsplit('/',1)[-1]
        if self.path.startswith('/v2/payments/refunds/'):
            value=pending_refunds[id];value['status']='COMPLETED';return self.answer(200,value)
        if id not in orders:return self.answer(404,{})
        self.answer(200,orders[id])
    def do_POST(self):
        body=self.rfile.read(int(self.headers.get('Content-Length',0)))
        if self.path=='/v1/oauth2/token':return self.answer(200,{'access_token':'fixture-access'})
        if self.headers.get('Authorization')!='Bearer fixture-access':return self.answer(401,{})
        bn=self.headers.get('PayPal-Partner-Attribution-Id');assert bn=='Vendune_Fixture_Only';bn_seen.append(bn)
        v=json.loads(body or b'{}');key=self.headers.get('PayPal-Request-Id');path=self.path
        if path=='/v1/notifications/verify-webhook-signature':return self.answer(200,{'verification_status':'SUCCESS' if v['transmission_sig']=='fixture-valid' else 'FAILURE'})
        with gate:
            if (path,key) in keys:return self.answer(200,keys[(path,key)])
            if path=='/v2/checkout/orders':
                from urllib.parse import urlsplit,parse_qs
                urls=v['payment_source']['paypal']['experience_context'];returned=parse_qs(urlsplit(urls['return_url']).query);cancelled=parse_qs(urlsplit(urls['cancel_url']).query)
                assert returned['shop']==['workshop'] and returned['channel']==['default'] and returned['paymentReturn']==['approved'] and cancelled['paymentReturn']==['cancelled'] and urls['return_url']!=urls['cancel_url']
                id='PAY-'+uuid.uuid4().hex[:16];value={'id':id,'status':'CREATED','purchase_units':v['purchase_units'],'links':[{'rel':'payer-action','href':'https://www.sandbox.paypal.com/checkoutnow?token='+id}]};orders[id]=value
            elif path.endswith('/capture'):
                id=path.split('/')[-2];value=copy.deepcopy(orders[id]);value['status']='COMPLETED';amount=copy.deepcopy(value['purchase_units'][0]['amount']);
                if behavior['badAmount']:amount['value']='0.01'
                value['purchase_units'][0]['payments']={'captures':[{'id':'CAP-'+id,'status':'COMPLETED','amount':amount}]};orders[id]=value;captures.append(id)
                keys[(path,key)]=value
                if behavior['lostCapture']:behavior['lostCapture']=False;return self.answer(503,{'error':'fixture lost response after capture'})
            elif path.endswith('/refund'):
                value={'id':'REF-'+uuid.uuid4().hex[:12],'status':'COMPLETED','amount':v['amount']};refunds.append(value)
                if behavior['pendingRefund']:behavior['pendingRefund']=False;value['status']='PENDING';pending_refunds[value['id']]=value
            else:return self.answer(404,{})
            keys[(path,key)]=value;self.answer(200,value)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
port=server.server_address[1];base='http://127.0.0.1:8794';accounts={t:{'clientId':'fixture-'+t,'clientSecret':'fixture-secret','webhookId':'fixture-webhook','bnCode':'Vendune_Fixture_Only'} for t in ['atelier','workshop']}
env={**os.environ,'BIND_ADDR':'127.0.0.1:8794','PAYPAL_SANDBOX_BASE_URL':f'http://127.0.0.1:{port}','PAYPAL_SANDBOX_ACCOUNTS':json.dumps(accounts)}
log=open(ROOT/'.run/payments-contract.log','w');process=None
def call(path,body=None,h=None,method=None,expected=200):
    if path == '/api/apps' and isinstance(body,dict) and ('manifest' in body or 'builtIn' in body): body=consent(body)
    req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
    except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
    assert code==expected,(path,code,v,expected);return v
def start():
    global process
    process=subprocess.Popen([str(ROOT/'target/debug/vendune')],cwd=ROOT,env=env,stdout=log,stderr=log)
    for _ in range(60):
        if process.poll() is not None:raise RuntimeError('Payment test app failed; inspect .run/payments-contract.log')
        try:call('/health');return
        except OSError:time.sleep(.2)
    raise TimeoutError('Payment app startup')
def check(name):checks.append(name);print('PASS',name)
def wait(id,h,state):
    for _ in range(100):
        v=call('/store-api/payments/'+id,h=h)
        if v['state']==state:return v
        time.sleep(.15)
    raise AssertionError((state,v,call('/api/payments',h=ah)['jobs'][:4]))
def purchase():
    h={'x-tenant':'workshop'};c=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},h);h['sw-context-token']=c['token'];c=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'notebook','quantity':1}]},h)
    selection=c['checkout'];selection['paymentMethodId']='paypal-sandbox';selection['customerEmail']='fixture-buyer@example.test';selection['billingAddress']={'name':'Fixture Buyer','firstName':'Fixture','lastName':'Buyer','street':'Test Street 1','postalCode':'12345','city':'Test','country':'DE'};call('/store-api/checkout/context',{'revision':c['revision'],'checkout':selection},h,'PUT')
    o=call('/store-api/checkout/order',{}, {**h,'Idempotency-Key':uuid.uuid4().hex});assert o['payment']['provider']=='paypal' and o['payment']['state']=='pending' and not o['payment']['realMoneyCharged'];return o,h
ah={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN'],'x-tenant':'workshop'}
try:
    start();call('/api/apps',{'builtIn':'paypal'},ah)
    config=call('/api/merchant/commerce',h=ah);settings=config['data'];next(p for p in settings['payments'] if p['id']=='paypal-sandbox')['active']=True
    call('/api/merchant/commerce',{'data':settings,'revision':config['revision']},ah,'PUT')
    o,h=purchase();id=o['payment']['attemptId'];v=wait(id,h,'ready');assert v['approvalUrl'].startswith('https://www.sandbox.paypal.com/')
    call('/store-api/payments/'+id,h={**h,'x-tenant':'atelier'},expected=404);call('/api/merchant/orders/'+o['id']+'/transition',{'kind':'payment','state':'paid','revision':o['revision']},ah,expected=409);check('Real pending order/reservation and payment handoff are scoped; manual paid override is rejected')
    pid=next(k for k,v in orders.items() if v['purchase_units'][0]['custom_id']==id);orders[pid]['status']='APPROVED';behavior['lostCapture']=True
    hh={**h,'Idempotency-Key':id+':capture'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:jobs=list(ex.map(lambda _:call('/store-api/payments/'+id+'/capture',{},hh),range(6)))
    assert len({j['jobId'] for j in jobs})==1;wait(id,h,'captured');assert captures.count(pid)==1;check('Concurrent capture and lost provider reply reconcile to one capture and one local result')
    automatic,auto_h=purchase();auto_id=automatic['payment']['attemptId'];wait(auto_id,auto_h,'ready')
    auto_pid=next(k for k,v in orders.items() if v['purchase_units'][0]['custom_id']==auto_id)
    call('/store-api/payments/'+auto_id+'/reconcile',{}, {**auto_h,'Idempotency-Key':auto_id+':forged-return'})
    time.sleep(.5);assert call('/store-api/payments/'+auto_id,h=auto_h)['state']=='ready' and captures.count(auto_pid)==0
    orders[auto_pid]['status']='APPROVED'
    call('/store-api/payments/'+auto_id+'/reconcile',{}, {**auto_h,'Idempotency-Key':auto_id+':approved-return'})
    auto_status=wait(auto_id,auto_h,'captured');assert captures.count(auto_pid)==1 and not auto_status['realMoneyCharged']
    check('Distinct scoped return/cancel URLs and verified approval automatically capture once; forged return cannot mark paid')
    wh={'x-tenant':'workshop','paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.sandbox.paypal.com/fixture','paypal-transmission-id':'fixture-transmission','paypal-transmission-sig':'fixture-valid','paypal-transmission-time':'2026-10-02T10:00:00Z'}
    event={'id':'EV-'+uuid.uuid4().hex,'event_type':'PAYMENT.CAPTURE.COMPLETED','resource':{'id':'CAP-'+pid,'supplementary_data':{'related_ids':{'order_id':pid}}}}
    call('/store-api/payments/paypal/webhooks',event,{**wh,'paypal-transmission-sig':'forged'},expected=401)
    assert not call('/store-api/payments/paypal/webhooks',event,wh)['duplicate'];assert call('/store-api/payments/paypal/webhooks',event,wh)['duplicate'];check('Provider verification precedes durable webhook inbox; duplicate delivery is harmless')
    amount=100;rh={**ah,'Idempotency-Key':id+':refund:100'};body={'approve':True,'amountMinor':amount}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:rs=list(ex.map(lambda _:call('/api/payments/'+id+'/refund',body,rh),range(4)))
    assert len({r['jobId'] for r in rs})==1;v=wait(id,h,'partially_refunded');assert v['refundedMinor']==100 and len(refunds)==1
    call('/api/payments/'+id+'/refund',{'approve':True,'amountMinor':v['amountMinor']}, {**ah,'Idempotency-Key':uuid.uuid4().hex},expected=409);check('Idempotent refund records exact cents and rejects over-refunding')
    behavior['pendingRefund']=True;pending_h={**ah,'Idempotency-Key':id+':pending-refund'}
    call('/api/payments/'+id+'/refund',{'approve':True,'amountMinor':100},pending_h)
    for _ in range(120):
        current=call('/store-api/payments/'+id,h=h)
        if current['refundedMinor']==200:break
        time.sleep(.15)
    assert current['refundedMinor']==200 and len(refunds)==2 and bn_seen
    check('Pending refund resumes by provider refund ID with no second refund; every wire request carries only configured synthetic attribution')
    process.terminate();process.wait(timeout=15);start();assert call('/store-api/payments/'+id,h=h)['refundedMinor']==200;check('Process restart preserves provider order, capture, refund and customer access')
    before=next(p for p in call('/store-api/product',{}, {'x-tenant':'workshop'})['elements'] if p['id']=='notebook')['stock'];cancelled,ch=purchase();cid=cancelled['payment']['attemptId'];wait(cid,ch,'ready')
    call('/store-api/payments/'+cid+'/cancel',{}, {**ch,'Idempotency-Key':cid+':cancel'});wait(cid,ch,'cancelled')
    after=next(p for p in call('/store-api/product',{}, {'x-tenant':'workshop'})['elements'] if p['id']=='notebook')['stock'];assert after==before
    call('/store-api/payments/'+cid+'/cancel',{}, {**ch,'Idempotency-Key':cid+':cancel'});assert call('/store-api/payments/'+cid,h=ch)['state']=='cancelled';check('Cancelled payment releases reserved stock exactly once')
    o2,h2=purchase();id2=o2['payment']['attemptId'];wait(id2,h2,'ready');pid2=next(k for k,v in orders.items() if v['purchase_units'][0]['custom_id']==id2);orders[pid2]['status']='APPROVED';behavior['badAmount']=True
    call('/store-api/payments/'+id2+'/capture',{}, {**h2,'Idempotency-Key':id2+':capture'})
    for _ in range(80):
        jobs=call('/api/payments',h=ah)['jobs']
        if any(j['attemptId']==id2 and j['state']=='uncertain' for j in jobs):break
        time.sleep(.15)
    assert call('/store-api/payments/'+id2,h=h2)['state']=='ready';assert any(j['attemptId']==id2 and j['state']=='uncertain' for j in jobs);check('Mismatched provider amount cannot mark an order paid; uncertainty retains reservation')
    assert not call('/api/payments',h=ah)['providers'][1]['configured'];assert 'fixture-secret' not in json.dumps(call('/api/payments',h=ah));check('Shopware Payments remains explicitly unconnected and provider secrets never reach UI')
    report={'passed':len(checks),'checks':checks,'livePayPalSandboxTraffic':False,'shopwarePaymentsConnected':False}
    if os.getenv('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
finally:
    if process and process.poll() is None:process.terminate();process.wait(timeout=15)
    log.close();server.shutdown()
