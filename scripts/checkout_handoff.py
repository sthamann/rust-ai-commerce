#!/usr/bin/env python3
"""Exercise actual PostgreSQL checkout transfer, isolation, replay and durable ordering."""
import concurrent.futures, hashlib, json, os, subprocess, urllib.request, urllib.error, uuid
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787');checks=[]
def call(path,body=None,h=None,method=None,expected=200):
    request=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(request,timeout=20) as r: code=r.status;value=json.load(r)
    except urllib.error.HTTPError as e: code=e.code;value=json.load(e)
    if expected is not None:assert code==expected,(path,code,value,expected)
    return value if expected is not None else (code,value)
def check(s):checks.append(s);print('PASS',s)
def user():return call('/api/auth/register',{'email':uuid.uuid4().hex+'@example.test','name':'Handoff test','password':'Synthetic-checkout-2026!','workspaceId':'handoff-'+uuid.uuid4().hex[:12],'workspaceName':'Checkout test shop'})
u=user();other=user();h={'x-tenant':u['workspace']};mh={**h,'Authorization':'Bearer '+u['token']}
def cart():
    c=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},h);ch={**h,'sw-context-token':c['token']}
    c=call('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':'mug-sage-350','quantity':2}]},ch,'PUT');return c,ch
def issue(c,ch):return call('/store-api/checkout/handoff',{'revision':c['revision']},ch)['checkoutPath'].split('#checkout/')[1]
c=call('/store-api/checkout/cart',{'session':'empty'},h);call('/store-api/checkout/handoff',{'revision':c['revision']},{**h,'sw-context-token':c['token']},expected=409)
c,ch=cart();call('/store-api/checkout/handoff',{'revision':c['revision']-1},ch,expected=409);check('Empty and stale carts cannot issue a transfer')
ticket=issue(c,ch);call('/store-api/checkout/handoff/consume',{'ticket':ticket},{'x-tenant':other['workspace']},expected=410)
old=ticket;ticket=issue(c,ch);call('/store-api/checkout/handoff/consume',{'ticket':old},h,expected=410);check('Tickets are tenant scoped and reissue revokes the previous transfer')
digest=hashlib.sha256(ticket.encode()).hexdigest()
subprocess.run(['docker','exec',os.getenv('DB_CONTAINER','vendune-postgres-1'),'psql','-U','commerce','-d',os.getenv('TEST_DATABASE','commerce'),'-q','-c',f"UPDATE checkout_handoffs SET expires_at=now()-interval '1 second' WHERE digest='{digest}'"],check=True,capture_output=True)
call('/store-api/checkout/handoff/consume',{'ticket':ticket},h,expected=410);check('Expired transfers fail against database time')
ticket=issue(c,ch)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:call('/store-api/checkout/handoff/consume',{'ticket':ticket},h,expected=None),range(2)))
assert sorted(code for code,_ in results)==[200,410],results
new=next(v for code,v in results if code==200);assert new['id']==c['id'] and new['token']!=c['token'] and new['revision']==c['revision']+1
assert new['lineItems'][0]['id']=='mug-sage-350' and new['lineItems'][0]['quantity']==2
call('/store-api/checkout/cart',h=ch,expected=404);call('/store-api/checkout/handoff/consume',{'ticket':ticket},h,expected=410);check('Exactly one concurrent consumer wins and the original cart token is revoked')
nh={**h,'sw-context-token':new['token'],'Idempotency-Key':uuid.uuid4().hex}
o=call('/store-api/checkout/order',{},nh);assert o['cart']['lineItems'][0]['referencedId']=='mug-sage-350'
assert call('/store-api/checkout/order',{},nh)['id']==o['id']
orders=call('/api/search/order',{},mh)['data'];assert any(x['id']==o['id'] for x in orders)
call('/store-api/checkout/handoff',{'revision':new['revision']},{**h,'sw-context-token':new['token']},expected=409);check('Transferred cart places one durable merchant order and terminal carts cannot transfer')
summary={'passed':len(checks),'checks':checks,'orderId':o['id'],'workspace':u['workspace'],'paymentState':o['payment']['state'],'paymentMode':'simulated, no external charge'}
if os.getenv('REPORT_PATH'):open(os.environ['REPORT_PATH'],'w').write(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
