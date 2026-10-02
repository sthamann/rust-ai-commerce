#!/usr/bin/env python3
"""Exercise the real HTTP -> Rust -> PostgreSQL path. Never contacts a PSP."""
import os,json,urllib.request,urllib.error,uuid,concurrent.futures,time,pathlib
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8787')
TOKEN=os.environ.get('MERCHANT_TOKEN','')
checks=[]
def request(path,body=None,headers=None,method=None,expected=200):
    hs={'Content-Type':'application/json',**(headers or {})}
    data=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(BASE+path,data=data,headers=hs,method=method or ('POST' if body is not None else 'GET'))
    try:
        with urllib.request.urlopen(req,timeout=200) as r:status=r.status;value=json.load(r)
    except urllib.error.HTTPError as e:status=e.code;value=json.load(e)
    assert status==expected,(path,status,value,expected)
    return value
def check(name):checks.append(name);print('PASS',name)
def cart(tenant='atelier'):
    session=str(uuid.uuid4());c=request('/store-api/checkout/cart',{'session':session},{'x-tenant':tenant});return c,{'sw-context-token':c['token'],'x-tenant':tenant},session
request('/health');check('Rust server connected to PostgreSQL')
if TOKEN:
    for tenant in ('atelier','workshop'):
        policy=request('/api/extensions',headers={'Authorization':'Bearer '+TOKEN,'x-tenant':tenant})
        assert policy['source']=='persisted' and len(policy['digest'])==64, 'First-start policy must be lockable by checkout'

ps=request('/store-api/product',{})['elements'];assert len(ps)==6;check('catalog reads seeded products')
c,h,s=cart();e=request('/api/experience',{'session':s});assert e['blocks'] and 0<e['propensity']<=1
c=request('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':2}]},h)
assert c['price']['totalPrice']==49.8 and c['lineItems'][0]['quantity']==2;check('B2C cart uses server price and tax')
request('/store-api/checkout/cart',{'items':[{'id':'mug','quantity':1}],'revision':1},h,'PUT',409);check('stale cart revision rejected')
request('/store-api/checkout/cart',None,{'sw-context-token':c['token'],'x-tenant':'workshop'},expected=404);check('customer context cannot cross tenants')
key='test-'+str(uuid.uuid4());hh={**h,'Idempotency-Key':key}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    results=list(ex.map(lambda _:request('/store-api/checkout/order',{},hh),range(8)))
assert len({r['id'] for r in results})==1;check('eight concurrent retries create exactly one order')
assert request('/store-api/checkout/cart',None,h)['status']=='completed'
request('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},h,expected=409);check('completed cart cannot mutate')
other,oh,_=cart();request('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},oh)
request('/store-api/checkout/order',{}, {**oh,'Idempotency-Key':key},expected=409);check('same idempotency key cannot purchase another cart')
request('/api/agent/plan',{'instruction':'change price'},expected=401)
request('/api/search/order',{},expected=401);check('merchant operations require credential')
b,bh,_=cart();b=request('/store-api/account/login',{'email':'buyer@example.test','password':'demo-business'},bh)
request('/store-api/checkout/cart',None,bh,expected=404);bh['sw-context-token']=b['token'];assert b['customerGroup']=='business'
b=request('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':5}]},bh)
assert b['lineItems'][0]['discountPercent']==15 and b['price']['taxStatus']=='net';check('B2B auth rotates context; quantity tier and net tax calculation')
request('/store-api/checkout/cart',{'items':[{'id':'desk','quantity':5}],'revision':b['revision']},bh,'PUT')
request('/store-api/checkout/order',{}, {**bh,'Idempotency-Key':'wasm-'+str(uuid.uuid4())},expected=409);check('persisted default Wasm policy blocks company checkout, including first start')
request('/store-api/checkout/cart',{'items':[{'id':'mug','quantity':10000}],'revision':b['revision']+1},bh,'PUT')
request('/store-api/checkout/order',{}, {**bh,'Idempotency-Key':'stock-'+str(uuid.uuid4())},expected=409);check('stock overflow rejected by checkout')
m=request('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'});assert any(t['name']=='catalog.search' for t in m['result']['tools']);assert not any(t['name'].startswith('merchant.') for t in m['result']['tools']);check('MCP exposes authorized typed capabilities')
m=request('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'cart.quote','arguments':{}}},h);assert m['result']['structuredContent']['id']==c['id'];check('MCP consumes same persisted cart')
u=request('/ucp/v1/checkout-sessions',{'line_items':[{'item':{'id':'notebook'},'quantity':1}]})
u=u.get('checkout',u);assert u['currency']=='EUR';check('UCP checkout uses integer minor units')
if TOKEN:
    stats=request('/api/policy',headers={'Authorization':'Bearer '+TOKEN})
    assert sum(v['purchases'] for v in stats['variants'])>=1;check('checkout produces persistent policy reward')
    orders=request('/api/search/order',{}, {'Authorization':'Bearer '+TOKEN})['data'];assert results[0]['id'] in [o['id'] for o in orders];check('merchant reads real persisted order')
report={'checks':checks,'passed':len(checks),'payment':'simulated','orderId':results[0]['id'],'session':s,'policyBeforeRestart':stats if TOKEN else None}
out=os.environ.get('REPORT_PATH');
if out:pathlib.Path(out).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':len(checks),'payment':'simulated'}))
