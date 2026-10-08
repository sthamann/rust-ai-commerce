#!/usr/bin/env python3
"""Isolated HTTP regressions for revisioned channels, domain aliases and session-bound private previews; no providers."""
import json, os, uuid, urllib.request, urllib.error, urllib.parse, threading
from http.server import HTTPServer, BaseHTTPRequestHandler
BASE=os.environ.get('BASE_URL','http://127.0.0.1:62326')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
opener=urllib.request.build_opener(NoRedirect)
def call(path,body=None,h=None,method=None,status=200,raw=False):
    req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json',**(h or {})},method=method)
    try:r=opener.open(req,timeout=30)
    except urllib.error.HTTPError as e:r=e
    data=r.read();assert r.status==status,(path,r.status,status,data[:400])
    return (data,r.headers) if raw else json.loads(data)
u=uuid.uuid4().hex[:10]
def merchant(prefix):
    a=call('/api/auth/register',{'workspaceId':prefix+'-'+u,'workspaceName':'Channel fixture','name':'Test owner','email':prefix+u+'@example.test','password':'Synthetic-test-2026!'})
    return a,{'x-tenant':a['workspace'],'Authorization':'Bearer '+a['token']}
a,ah=merchant('channels');b,bh=merchant('foreign-channels')
shop=a['workspace'];sh={'x-tenant':shop,'x-commerce-locale':'en-GB'}
def channel(id):return next(c for c in call('/api/automation',h=ah)['channels'] if c['id']==id)
def save(c):
    result=call('/api/automation/channels/'+c['id'],{'revision':c['revision'],'data':c['data']},ah,'PUT');c['revision']=result['revision'];return c
main=channel('default');main['data']['name']['en-GB']='Edited main';save(main)
assert channel('default')['data']['name']['en-GB']=='Edited main'
call('/api/automation/channels/default',{'revision':1,'data':main['data']},ah,'PUT',409)
extra={'id':'private_test','revision':0,'data':{'name':{'en-GB':'Private test'},'kind':'storefront','active':True,'visibility':'private','locales':['en-GB'],'productIds':[]}}
save(extra)
private={**sh,'sw-sales-channel-id':extra['id']}
call('/store-api/product',{},private,status=403)
call('/store-api/product',{}, {**private,'x-rac-role':'owner','x-rac-user':a['user']['id']},status=403)
call('/store-api/product',{}, {**private,'Authorization':ah['Authorization']})
call('/store-api/product',{}, {**private,'Authorization':bh['Authorization']},status=403)
call('/ucp/v1/checkout-sessions',{},private,status=403)
call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},private,status=403)
# Provision a canonical mount just as Experience onboarding does, then reuse it on a new address/channel.
call('/api/settings/frontends',{'alias':shop,'channel':'default'},ah,'PUT')
alias='channel-preview-'+u
mount=call('/api/settings/frontends',{'alias':alias,'channel':extra['id'],'experienceAlias':shop,'revision':0},ah,'PUT')
row=next(f for f in call('/api/settings/frontends',h=ah)['frontends'] if f['alias']==alias)
assert row['experienceAlias']==shop and '/design/'+shop in row['editorUrl']
assert call('/api/settings/frontends',h=bh)['frontends']==[]
call('/api/settings/frontends',{'alias':alias,'channel':'default'},bh,'PUT',409)
assert next(f for f in call('/api/settings/frontends',h=ah)['frontends'] if f['alias']==alias)==row
call('/api/settings/frontends',{'alias':alias,'channel':'default','revision':0,'experienceAlias':shop},ah,'PUT',409)
call('/api/settings/frontends',{'alias':'invalid-'+u,'channel':'default','experienceAlias':b['workspace'],'revision':0},ah,'PUT',400)
assert call('/api/automation/channels/private_test/dependencies',h=ah)['dependencies'][0]['kind']=='frontends'
call('/api/automation/channels/private_test',{'revision':extra['revision']},ah,'DELETE',409)
call('/api/settings/frontends/'+alias,{'revision':1},bh,'DELETE',409)
call('/api/automation/channels/private_test/preview',{'alias':b['workspace']},ah,status=400)
def preview():
    p=call('/api/automation/channels/private_test/preview',{'alias':alias},ah)
    parsed=urllib.parse.urlsplit(p['url']);host=parsed.netloc
    path=parsed.path+'?'+parsed.query
    _,headers=call(path,h={'Host':host},status=303,raw=True)
    cookie=headers['Set-Cookie'].split(';')[0]
    assert 'HttpOnly' in headers['Set-Cookie'] and 'no-referrer'==headers['Referrer-Policy']
    call(path,h={'Host':host},status=401)
    return {'Host':host,'Cookie':cookie,'x-commerce-locale':'en-GB'}
class Frontend(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        data=json.dumps({k:self.headers.get(k) for k in ['x-frontend-alias','x-frontend-host','x-frontend-tenant','x-frontend-channel','authorization','cookie','x-channel-preview']}).encode()
        self.send_response(200);self.send_header('content-type','application/json');self.end_headers();self.wfile.write(data)
port=urllib.parse.urlsplit(os.environ.get('HOSTED_FRONTEND_ORIGIN','http://127.0.0.1:62327')).port
server=HTTPServer(('127.0.0.1',port),Frontend)
threading.Thread(target=server.serve_forever,daemon=True).start()
call('/',h={'Host':alias+'.'+os.environ.get('SHOP_DOMAIN_SUFFIX','channel.test')},status=403,raw=True)
ph=preview()
mounted=call('/',h=ph)
assert mounted['x-frontend-alias']==shop and mounted['x-frontend-host']==alias and mounted['x-frontend-channel']=='private_test'
assert mounted['x-frontend-tenant']==shop and mounted['authorization'] is None and mounted['cookie'] is None
assert len(mounted['x-channel-preview'])==64
call('/store-api/product',{},ph)
call('/store-api/navigation',{},ph)
call('/api/experience',{},ph,status=403)
call('/store-api/checkout/order',{},ph,status=403)
call('/store-api/account/register',{},ph,status=403)
call('/store-api/product',{}, {**sh,'Cookie':ph['Cookie']},status=403)
extra['data']['active']=False;save(extra)
call('/store-api/product',{},ph,status=403)
call('/store-api/product',{}, {**private,'x-rac-channel-preview':'private_test'},status=403)
ph=preview();call('/store-api/product',{},ph)
call('/store-api/product',{},private,status=403)
call('/store-api/checkout/order',{},ph,status=403)
# Main channels can be paused; administrative HTTP and MCP remain reachable.
main['data']['active']=False;save(main)
call('/store-api/product',{},sh,status=403)
call('/api/automation',h=ah)
main['data']['active']=True;save(main)
# Logout cascades all preview grants. Victim data remains untouched.
call('/api/auth/logout',{},ah)
call('/store-api/product',{},ph,status=403)
auth=call('/api/auth/login',{'email':'channels'+u+'@example.test','password':'Synthetic-test-2026!'})
ah['Authorization']='Bearer '+auth['token']
call('/api/settings/frontends/'+alias,{'revision':row['revision']},ah,'DELETE')
call('/api/automation/channels/private_test',{'revision':extra['revision']},ah,'DELETE')
assert not any(c['id']=='private_test' for c in call('/api/automation',h=ah)['channels'])
call('/api/automation/channels/default',{'revision':main['revision']},ah,'DELETE',409)
server.shutdown();server.server_close()
print('PASS channel CRUD, default pause, private Store API/UCP/MCP, domain ownership/revisions, dependency deletion, one-use previews, stale grants and logout revocation')
