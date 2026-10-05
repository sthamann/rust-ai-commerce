#!/usr/bin/env python3
"""Real multi-user, workspace isolation and role/revocation regression tests.
Creates uniquely named synthetic workspaces/accounts. Never contacts a PSP.
"""
import json, os, pathlib, uuid, urllib.request, urllib.error, subprocess, concurrent.futures
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787'); checks=[]
password='Synthetic-account-2026!'; suffix=uuid.uuid4().hex[:10]
def req(path, body=None, headers=None, method=None, expected=200):
    r=urllib.request.Request(BASE+path, data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})},method=method or ('POST' if body is not None else 'GET'))
    try:
        with urllib.request.urlopen(r,timeout=60) as response: status=response.status; data=json.load(response)
    except urllib.error.HTTPError as e: status=e.code; data=json.load(e)
    assert status==expected,(path,status,expected,data)
    return data
def check(s): checks.append(s); print('PASS',s)
def headers(s,tenant=None):return {'Authorization':'Bearer '+s['token'],'x-tenant':tenant or s['workspace']}
def register(label):return req('/api/auth/register',{'name':label,'email':label+'-'+suffix+'@example.test','password':password,'workspaceId':label+'-'+suffix,'workspaceName':label.title()+' Demo'})
def invite(owner, role, label):
    i=req('/api/workspace/invitations',{'email':label+'-'+suffix+'@example.test','role':role},headers(owner))
    s=req('/api/auth/accept',{'name':label.title(),'password':password,'invitationToken':i['token']})
    req('/api/auth/accept',{'name':label,'password':password,'invitationToken':i['token']},expected=404)
    return s
owner=register('team'); other=register('isolated'); oh=headers(owner)
assert owner['workspaces']==[{'id':owner['workspace'],'name':'Team Demo','role':'owner'}]
assert 'password_hash' not in json.dumps(owner); check('personal owner registration and scoped workspace discovery')
req('/api/auth/login',{'email':owner['user']['email'],'password':'wrong'},expected=401)
req('/api/auth/login',{'email':'nonexistent-'+suffix+'@example.test','password':password},expected=401)
logged=req('/api/auth/login',{'email':owner['user']['email'],'password':password}); assert logged['user']==owner['user']; check('Argon2 personal login verifies actual credentials')
req('/api/auth/register',{'name':'Collision','email':'collision-'+suffix+'@example.test','password':password,'workspaceId':owner['workspace']},expected=409)
req('/api/auth/register',{'name':'Invalid','email':'invalid-'+suffix+'@example.test','password':'short','workspaceId':'--'},expected=400)
check('existing shop ownership cannot be claimed by registration')
req('/api/search/order',{}, {'x-rac-user':'bootstrap','x-rac-role':'owner','x-rac-tenant':'atelier'},expected=401)
req('/api/search/order',{}, {'Authorization':'Bearer nonsense'},expected=401); check('forged internal identity headers and invalid bearer rejected')
for path,body in [('/api/merchant/overview',None),('/api/search/order',{}),('/api/search/product',{}),('/api/knowledge',None),('/api/knowledge/status',None),('/api/knowledge/search',{'query':'light'}),('/api/agent/conversations',None),('/api/policy',None),('/api/extensions',None),('/api/runtime',None),('/api/merchant/commerce',None),('/api/workspace/members',None)]:
    req(path,body,headers(owner,other['workspace']),expected=403)
check('merchant facts, graph, vectors, conversations and configuration reject foreign membership')
assert req('/api/search/order',{},oh)['data']==[]
assert req('/api/agent/conversations',headers=oh)['conversations']==[]
assert len(req('/api/search/product',{},oh)['elements'])==6
assert len(req('/store-api/product/mug',headers={'x-tenant':owner['workspace']})['variants'])==4
check('new workspace starts with isolated synthetic catalog and empty private activity')
viewer=invite(owner,'viewer','reader'); editor=invite(owner,'editor','editor'); admin=invite(owner,'admin','admin'); vh=headers(viewer); eh=headers(editor); ah=headers(admin)
check('single-use invitations create personal reader, editor and administrator memberships')
assert len(req('/api/search/product',{},vh)['elements'])==6
req('/api/merchant/quote',{'productId':'mug','quantity':6,'customerGroup':'consumer'},vh)
for path,body,method in [('/api/workspace/invitations',{'email':'x@example.test','role':'admin'},'POST'),('/api/merchant/commerce',{},'PUT'),('/api/extensions/activate',{'wat':'(module)'},'POST'),('/api/agent/tasks/no-such-task/apply',{},'POST')]:req(path,body,vh,method,403)
check('reader can inspect catalog and quotes but cannot mutate commerce, users or proposals')
m=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},vh)
assert not any(t['name']=='merchant.apply' for t in m['result']['tools'])
m=req('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'merchant.apply','arguments':{'proposalId':'fake'}}},vh)
assert m['result']['isError']
public=req('/mcp',{'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'knowledge.graph','arguments':{}}})
assert public['result']['isError']
check('MCP capability listing and direct invocation enforce reader permissions')
for path,body,method in [('/api/workspace/invitations',{'email':'x@example.test'},'POST'),('/api/merchant/commerce',{},'PUT'),('/api/extensions/activate',{'wat':'(module)'},'POST')]:req(path,body,eh,method,403)
check('editor cannot alter shop settings, users or extension runtime')
req('/api/workspace/invitations',{'email':'owner-upgrade@example.test','role':'owner'},ah,expected=403)
req('/api/workspace/members/'+owner['user']['id'],{'role':'viewer','active':True},ah,'PUT',403)
req('/api/workspace/members/'+owner['user']['id'],{'role':'viewer','active':True},oh,'PUT',409)
check('administrator cannot grant ownership; final owner cannot be removed')
req('/api/workspace/members/'+viewer['user']['id'],{'role':'editor','active':True},oh,'PUT')
req('/api/extensions/activate',{'wat':'(module)'},vh,expected=403)
req('/api/workspace/members/'+viewer['user']['id'],{'role':'editor','active':False},oh,'PUT')
req('/api/search/product',{},vh,expected=403)
check('role changes and revocation affect already issued sessions on the next request')
i=req('/api/workspace/invitations',{'email':editor['user']['email'],'role':'viewer'},headers(other))
req('/api/auth/accept',{'name':'Existing','password':'wrong-password','invitationToken':i['token']},expected=401)
second=req('/api/auth/accept',{'name':'Existing','password':password,'invitationToken':i['token']})
assert len(second['workspaces'])==2 and second['user']['id']==editor['user']['id']
assert len(req('/api/search/product',{},headers(editor,other['workspace']))['elements'])==6
check('one personal account can access two independently authorized workspaces')
c=req('/store-api/checkout/cart',{'session':'users-'+suffix},{'x-tenant':owner['workspace']});ch={'x-tenant':owner['workspace'],'sw-context-token':c['token']}
req('/store-api/checkout/cart',headers={**ch,'x-tenant':other['workspace']},expected=404)
stock=req('/store-api/product/mug',headers={'x-tenant':other['workspace']})['product']['stock']
c=req('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},ch)
o=req('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':'users-'+suffix})
assert req('/store-api/product/mug',headers={'x-tenant':other['workspace']})['product']['stock']==stock
assert req('/api/search/order',{},headers(other))['data']==[]
assert req('/api/search/order',{},oh)['data'][0]['id']==o['id'];check('cart tokens, orders and stock remain isolated across merchant workspaces')
req('/api/merchant/orders/'+o['id']+'/transition',{'revision':1,'kind':'payment','state':'paid'},eh,expected=403)
req('/api/merchant/orders/'+o['id']+'/transition',{'revision':1,'kind':'payment','state':'paid'},headers(other),expected=404)
check('order operations require both role permission and owning workspace')
config=req('/api/merchant/commerce',headers=ah)
req('/api/merchant/commerce',{'revision':config['revision'],'data':config['data']},ah,'PUT');check('administrator can update own commerce configuration')
# Expiration is exercised against the actual DB predicate, not a mocked clock.
expired=req('/api/workspace/invitations',{'email':'expired-'+suffix+'@example.test','role':'viewer'},oh)
assert all(c in '0123456789abcdef' for c in expired['id'])
subprocess.run(['docker','exec',os.getenv('DB_CONTAINER','vendune-postgres-1'),'psql','-U','commerce','-d',os.getenv('TEST_DATABASE','commerce'),'-c',"UPDATE user_invites SET expires_at=now()-interval '1 second' WHERE id='"+expired['id']+"'"],check=True,capture_output=True)
req('/api/auth/accept',{'name':'Expired','password':password,'invitationToken':expired['token']},expected=404)
check('expired invitation cannot create a membership')
coowner=invite(owner,'owner','coowner')
def demote(user):
    r=urllib.request.Request(BASE+'/api/workspace/members/'+user, data=json.dumps({'role':'viewer','active':True}).encode(),headers={'Content-Type':'application/json',**oh},method='PUT')
    try:
        with urllib.request.urlopen(r) as response:return response.status
    except urllib.error.HTTPError as e:return e.code
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(demote,[owner['user']['id'],coowner['user']['id']]))
assert sorted(results)==[200,409]
survivor=owner if results[0]==409 else coowner
for person in [owner,coowner]:req('/api/workspace/members/'+person['user']['id'],{'role':'owner','active':True},headers(survivor),'PUT')
check('concurrent owner demotions serialize and preserve an active owner')
req('/api/auth/logout',{},headers(second));req('/api/auth/session',headers=headers(second),expected=401)
# A read-only user can sign out as well.
reader=invite(other,'viewer','logout'); req('/api/auth/logout',{},headers(reader));req('/api/auth/session',headers=headers(reader),expected=401)
check('logout invalidates opaque personal sessions, including reader sessions')
state=pathlib.Path(__file__).resolve().parents[1]/'.run/users-state.json';state.parent.mkdir(exist_ok=True)
state.write_text(json.dumps({'owner':owner,'other':other,'editor':editor,'revoked':viewer,'orderId':o['id']}));state.chmod(0o600)
report={'suite':'users-v4','passed':len(checks),'checks':checks,'workspace':owner['workspace'],'syntheticData':True}
print(json.dumps(report,indent=2))
if os.getenv('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
