#!/usr/bin/env python3
"""Sell the remaining workshop desks under contention; separate synthetic tenant."""
import json,os,urllib.request,urllib.error,concurrent.futures,uuid,pathlib
base=os.environ.get('BASE_URL','http://127.0.0.1:8787')
def req(path,body=None,h=None):
    r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
    try:
        with urllib.request.urlopen(r) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
_,ps=req('/store-api/product',{}, {'x-tenant':'workshop'});before=next(p['stock'] for p in ps['elements'] if p['id']=='desk')
assert 0<before<=50,'Run on seeded demo workshop tenant; this test consumes its remaining desk stock.'
contexts=[]
for _ in range(before+5):
    status,c=req('/store-api/checkout/cart',{'session':uuid.uuid4().hex},{'x-tenant':'workshop'});assert status==200
    h={'sw-context-token':c['token'],'x-tenant':'workshop','Idempotency-Key':'race-'+uuid.uuid4().hex}
    assert req('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'desk','quantity':1}]},h)[0]==200
    contexts.append(h)
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:out=list(pool.map(lambda h:req('/store-api/checkout/order',{},h),contexts))
success=sum(s==200 for s,_ in out);rejected=sum(s==409 for s,_ in out)
_,ps=req('/store-api/product',{}, {'x-tenant':'workshop'});after=next(p['stock'] for p in ps['elements'] if p['id']=='desk')
assert success==before and rejected==5 and after==0,(success,rejected,after)
report={'tenant':'workshop','initialStock':before,'concurrentPurchases':len(contexts),'ordersPlaced':success,'rejectedForStock':rejected,'finalStock':after,'oversold':False,'payment':'simulated'}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
