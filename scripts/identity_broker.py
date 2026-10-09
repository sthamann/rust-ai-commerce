#!/usr/bin/env python3
"""Synthetic broker signatures, durable replay prevention, scoped frontend routing and private Studio handoff; no provider calls."""
from testing.app_approval import consent
from testing.database import psql
import base64, hashlib, hmac, json, os, socket, time, urllib.error, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread, Event
from testing.runtime import ROOT, serve, stop
key = 'a' * 64
suffix = uuid.uuid4().hex[:8]
issuer = 'https://experience.example.test'
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
finish_stream=Event()
class Frontend(BaseHTTPRequestHandler):
    def do_POST(self):
        self.received_body=self.rfile.read(int(self.headers.get('Content-Length','0'))).decode()
        self.do_GET()
    def do_GET(self):
        if self.path == '/assets/probe.js':
            self.send_response(200);self.send_header('Content-Type','application/javascript');self.end_headers()
            self.wfile.write(b'// hosted source\n' * 400);return
        if self.path == '/stream':
            self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
            self.wfile.write(b'data: ready\n\n');self.wfile.flush();finish_stream.wait(5);return
        data={'path':self.path,'body':getattr(self,'received_body',None),'alias':self.headers.get('x-frontend-alias'),'tenant':self.headers.get('x-frontend-tenant'),'channel':self.headers.get('x-frontend-channel'),'cookie':self.headers.get('cookie'),'authorization':self.headers.get('authorization'),'authenticated':self.headers.get('x-frontend-key')=='b'*64}
        self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Set-Cookie','shopper_sid=opaque-123; Path=/; HttpOnly; Secure; SameSite=Lax');self.send_header('Set-Cookie','admin_token=forbidden; Path=/; HttpOnly; Secure; SameSite=Lax');self.end_headers();self.wfile.write(json.dumps(data).encode())
    def log_message(self,*args): pass
frontend=ThreadingHTTPServer(('127.0.0.1',0),Frontend)
Thread(target=frontend.serve_forever,daemon=True).start()
env={**os.environ,'BIND_ADDR':f'127.0.0.1:{port}','IDENTITY_BROKER_KEY':key,'IDENTITY_BROKER_ISSUER':issuer,'HOSTED_FRONTEND_KEY':'b'*64,'HOSTED_FRONTEND_ORIGIN':f'http://127.0.0.1:{frontend.server_port}','HOSTED_FRONTEND_EDITOR_URL':'https://experience.example.test/design/{alias}','DEMO_CATALOG':'fashion','HOSTED_FRONTEND_COOKIE_NAMES':'shopper_sid'}
def call(path,body=None,headers=None,method=None,expected=200):
    if path == '/api/apps' and isinstance(body,dict) and ('manifest' in body or 'builtIn' in body): body=consent(body)
    req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})},method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(req,timeout=45) as r:code,data=r.status,json.load(r)
    except urllib.error.HTTPError as e:
        code=e.code;raw=e.read()
        try:data=json.loads(raw)
        except ValueError:data={'nonJsonResponse':raw[:200].decode(errors='replace')}
    assert code==expected,(path,code,expected,data)
    return data

def signed(path,subject,**extra):
    now=int(time.time());claims={'iss':issuer,'aud':'vendune-identity','verified':True,'sub':subject,'email':subject+'@example.test','name':'Test owner','iat':now,'exp':now+60,'nonce':uuid.uuid4().hex+uuid.uuid4().hex,**extra}
    payload=base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    signature=base64.urlsafe_b64encode(hmac.new(key.encode(),(path+'\n'+payload).encode(),hashlib.sha256).digest()).decode().rstrip('=')
    return {'payload':payload,'signature':signature}

def check(message): print('PASS',message)
path='/api/identity/exchange'
shop='broker-'+suffix;other='other-'+suffix
subject='identity-'+suffix
with (ROOT/'artifacts/identity-broker-server.log').open('w') as log:
    server=serve(env,base,log)
    try:
        assertion=signed(path,subject,workspaceId=shop,workspaceName='Fashion test',demoCatalog=True)
        one=call(path,assertion);mh={'x-tenant':shop,'Authorization':'Bearer '+one['token']}
        assert len(call('/store-api/product',{'limit':100},{'x-tenant':shop})['elements'])==12
        assert 'coat' in json.dumps(call('/api/knowledge',headers=mh))
        call(path,assertion,expected=401)
        for changes in [{'iss':'https://evil.example'},{'verified':False},{'exp':int(time.time())-1}]:
            call(path,signed(path,subject,workspaceId=shop,workspaceName='Test',**changes),expected=401)
        bad=signed(path,subject,workspaceId=shop,workspaceName='Test');bad['signature']=base64.urlsafe_b64encode(b'wrong-signature-bytes-for-testing').decode().rstrip('=');call(path,bad,expected=401)
        call(path,signed('/api/identity/inference',subject,workspaceId=shop,workspaceName='Test'),expected=401)
        check('Only verified, correctly signed, current, one-use assertions create owned shops with the shipping fashion catalog')
        two=call(path,signed(path,'second-'+suffix,workspaceId=other,workspaceName='Other',demoCatalog=False))
        assert not call('/store-api/product',{}, {'x-tenant':other})['elements']
        call(path,signed(path,'second-'+suffix,workspaceId=shop,workspaceName='Foreign'),expected=409)
        call(path,signed(path,subject,email='changed-'+suffix+'@example.test',workspaceId=shop,workspaceName='Test'),expected=409)
        check('Foreign shop takeover and silent identity-email relinking fail; opt-out produces an empty catalog')
        cred='/api/identity/credentials';secret='Synthetic-merchant-password-123'
        assert one['passwordSetupRequired'] is True
        call('/api/auth/handoff',{},mh,expected=403)
        call(cred,signed(cred,subject,workspaceId=other,action='set-password',password=secret),expected=401)
        call(cred,signed(cred,subject,email='wrong@example.test',workspaceId=shop,action='set-password',password=secret),expected=401)
        call(cred,signed(cred,subject,workspaceId=shop,action='set-password',password='short'),expected=400)
        call(cred,signed(path,subject,workspaceId=shop,action='set-password',password=secret),expected=401)
        enroll=signed(cred,subject,workspaceId=shop,action='set-password',password=secret)
        one=call(cred,enroll);assert one['passwordSetupRequired'] is False
        call(cred,enroll,expected=401)
        call('/api/auth/session',headers=mh,expected=401)
        mh={'x-tenant':shop,'Authorization':'Bearer '+one['token']}
        account=call('/api/auth/login',{'email':subject+'@example.test','password':secret})
        assert account['user']['id']==one['user']['id']
        call(cred,signed(cred,subject,workspaceId=shop,action='verify-password',password='Wrong-password-123'),expected=401)
        same=call(cred,signed(cred,subject,workspaceId=shop,action='verify-password',password=secret))
        assert same['user']['id']==one['user']['id']
        # Adding another shop through the broker must preserve an existing chosen password.
        again=call(path,signed(path,subject,workspaceId=shop,workspaceName='Existing'))
        assert again['passwordSetupRequired'] is False
        assert call('/api/auth/login',{'email':subject+'@example.test','password':secret})['user']['id']==one['user']['id']
        check('Explicit credential setup enables real login, revokes old sessions and rejects foreign ownership, bad signatures, replay and wrong passwords')
        # Stable import IDs must preserve normal edits and reject accidental overwrite.
        stable=str(uuid.uuid4())
        product={'id':stable,'revision':0,'translations':{'en':{'name':'Imported product','description':'Merchant fact'}},'extra':{},'catalog':{'active':True,'productNumber':stable,'parentId':None,'options':{},'categoryIds':[]},'commerce':{'price':12.5,'taxRate':19,'stock':4,'minPurchase':1,'purchaseSteps':1,'maxPurchase':None,'deliveryDays':3,'listPrice':None,'advancedPrices':[],'media':[],'properties':{}}}
        call('/api/merchant/products',product,mh)
        call('/api/merchant/products',product,mh,expected=409)
        assert call('/api/merchant/products/'+stable,headers=mh)['commerce']['price']==12.5
        call('/api/merchant/products/'+stable,headers={'x-tenant':other,'Authorization':'Bearer '+two['token']},expected=404)
        # Invalid schemas and large-but-bounded vision assertions reach the native route safely without a paid provider.
        infer='/api/identity/inference'
        call(infer,signed(infer,subject,system='Test',input='Test',schema={'$ref':'http://private/'}),expected=400)
        call(infer,signed(infer,subject,system='Test',input='Test',schema={'type':'object'}),expected=400)
        call(infer,signed(infer,subject,system='Test',input='Test',schema={'type':'object'},images=['data:image/png;base64,'+'A'*100000]),expected=400)
        check('Stable UUID imports cannot overwrite existing products or expose foreign editors; bounded vision assertions retain schema admission')
        old_ticket=call('/api/auth/handoff',{},mh)['ticket']
        one=call(cred,signed(cred,subject,workspaceId=shop,action='set-password',password=secret+'-new'))
        call('/api/auth/redeem',{'ticket':old_ticket},expected=401)
        mh={'x-tenant':shop,'Authorization':'Bearer '+one['token']}
        ticket=call('/api/auth/handoff',{},mh)['ticket'];assert len(ticket)==64
        session=call('/api/auth/redeem',{'ticket':ticket});assert session['user']['id']==one['user']['id']
        call('/api/auth/redeem',{'ticket':ticket},expected=401)
        call('/api/search/product',{}, {'x-tenant':other,'Authorization':'Bearer '+session['token']},expected=403)
        check('A Studio handoff redeems once to the personal account and never grants another merchant workspace')
        alias='world-'+suffix
        call('/api/settings/frontends',{'alias':alias,'channel':'default'},mh,method='PUT')
        th={'x-tenant':other,'Authorization':'Bearer '+two['token']}
        mounted=call('/api/settings/frontends',headers=mh)['frontends']
        assert len(mounted)==1 and mounted[0]['alias']==alias and mounted[0]['channel']=='default'
        assert mounted[0]['editorUrl']==f'https://experience.example.test/design/{alias}'
        assert not call('/api/settings/frontends',headers=th)['frontends']
        call('/api/settings/frontends',headers={'x-tenant':shop},expected=401)
        call('/api/settings/frontends',headers={**mh,'x-tenant':other},expected=403)
        check('Existing Experience mounts and operator editor links are discoverable only in the authenticated member workspace')
        call('/api/settings/frontends',{'alias':alias,'channel':'default'},th,method='PUT',expected=409)
        call('/api/settings/frontends',{'alias':alias,'channel':'missing'},mh,method='PUT',expected=400)
        host={'Host':alias+'.vendune.ai','cookie':'merchant-cookie','Authorization':'Bearer '+one['token']}
        data=call('/',headers=host);assert data['tenant']==shop and data['channel']=='default' and data['authenticated'] and data['cookie'] is None and data['authorization'] is None
        data=call('/',headers={**host,'cookie':'admin_token=secret; shopper_sid=opaque-123'});assert data['cookie']=='shopper_sid=opaque-123' and data['authorization'] is None
        public_api='/api/v1/commerce.json'
        data=call(public_api+'?operation=status',headers={**host,'x-frontend-tenant':other})
        assert data['path']==public_api+'?operation=status' and data['tenant']==shop and data['authorization'] is None and data['authenticated']
        data=call(public_api,{'operation':'checkout','sku':stable},host)
        assert json.loads(data['body'])=={'operation':'checkout','sku':stable} and data['tenant']==shop
        call(public_api,headers={'x-tenant':shop},expected=403)
        call(public_api,headers={'Host':other+'.vendune.ai'},expected=403)
        call(public_api,headers={**host,'x-tenant':other},expected=400)
        call('/api/unregistered',headers=host,expected=403)
        call('/api/v1/%2e%2e/platform/shops',headers=host,expected=403)
        check('Public frontend API GET/POST preserve body and query, derive tenant from the mount and never expose Core credentials or unmounted APIs')
        req=urllib.request.Request(base+'/',headers=host)
        with urllib.request.urlopen(req,timeout=5) as response:
            assert response.headers.get_all('Set-Cookie')==['shopper_sid=opaque-123; Path=/; HttpOnly; Secure; SameSite=Lax']
        req=urllib.request.Request(base+'/assets/probe.js',headers={**host,'Accept-Encoding':'gzip,br'})
        with urllib.request.urlopen(req,timeout=5) as response:
            assert response.headers.get('Content-Encoding') is None
            assert response.read()==b'// hosted source\n' * 400
        req=urllib.request.Request(base+'/stream',headers=host)
        try:
            with urllib.request.urlopen(req,timeout=2) as response:
                assert response.readline()==b'data: ready\n'
        finally:finish_stream.set()
        check('Only configured opaque shopper cookies round-trip; first SSE event arrives before upstream EOF')
        call('/',headers={**host,'x-tenant':other},expected=400)
        call('/api/platform/overview',headers={'Host':alias+'.vendune.ai'},expected=401)
        call(path,signed(path,'new-'+suffix,workspaceId=alias,workspaceName='Reserved alias'),expected=409)
        check('Hosted addresses are tenant-bound, forbid collisions, strip credentials and do not proxy merchant APIs')
        import subprocess
        subprocess.run(psql(os.environ['DB_CONTAINER'],os.environ.get('TEST_DATABASE_USER','commerce'),os.environ['TEST_DATABASE'],'-v','ON_ERROR_STOP=1','-c',f"UPDATE tenants SET status='paused' WHERE id='{shop}'"),check=True,capture_output=True)
        call('/',headers=host,expected=503)
        call(public_api,headers=host,expected=503)
        call(public_api,{},host,expected=503)
        check('Paused shops cannot remain available through a separately mounted frontend')
        # Reconstruct the pre-055 schema in this disposable database, with a real unregistered hosted shop.
        call('/api/settings/frontends',{'alias':other,'channel':'default'},th,method='PUT')
        assert not call('/api/apps',headers=th)['packages']
        stop(server)
        subprocess.run(psql(os.environ['DB_CONTAINER'],os.environ.get('TEST_DATABASE_USER','commerce'),os.environ['TEST_DATABASE'],'-v','ON_ERROR_STOP=1','-c',"ALTER TABLE hosted_frontends DROP COLUMN app_id; DELETE FROM commerce_migrations WHERE version='055-hosted-apps';"),check=True,capture_output=True)
        server=serve(env,base,log)
        installed=next(p for p in call('/api/apps',headers=th)['packages'] if p['id']=='storyfront')
        assert installed['active'] and installed['managedBy']=='experience' and installed['connections'][0]['alias']==other
        assert installed['revision']==1
        check('Pre-055 Experience mounts install the real bundled package through migration, not a GET-side repair')
        stop(server);server=serve(env,base,log)
        assert next(p for p in call('/api/apps',headers=th)['packages'] if p['id']=='storyfront')['revision']==1
        check('A fresh restart preserves managed installation without reinstalling or changing version history')
        call(path,assertion,expected=401)
        call('/api/auth/redeem',{'ticket':ticket},expected=401)
        call(path,signed(path,subject,workspaceId=shop,workspaceName='Existing'))
        check('Fresh processes retain replay consumption and existing identity ownership')
    finally:stop(server);frontend.shutdown();frontend.server_close()
