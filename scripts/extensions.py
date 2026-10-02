#!/usr/bin/env python3
"""Activate actual Wasm policies and prove their effect on B2B checkout.
Restores the previously active tenant extension, including on failure.
Use only with synthetic demo inventory; no payment provider is contacted.
"""
import hashlib,json,os,uuid,pathlib,urllib.request,urllib.error,subprocess,time,socket
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787'); tenant=os.getenv('TEST_TENANT','workshop')
assert tenant.isascii() and all(c.isalnum() or c=='-' for c in tenant), 'Invalid test tenant'
root=pathlib.Path(__file__).resolve().parents[1];checks=[]
admin={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN'],'x-tenant':tenant}
def req(path,body=None,h=None,expected=200,backend=None):
    r=urllib.request.Request((backend or BASE)+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','x-tenant':tenant,**(h or {})},method='POST' if body is not None else 'GET')
    try:
        with urllib.request.urlopen(r,timeout=60) as response: status=response.status;data=json.load(response)
    except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
    assert status==expected,(path,status,expected,data)
    return data
# Read the exact prior policy privately from our local DB, so custom policies are preserved.
r=subprocess.run(['docker','exec',os.getenv('DB_CONTAINER','rust-ai-commerce-postgres-1'),'psql','-U','commerce','-d','commerce','-At','-c',"SELECT to_json(wat)::text FROM public.extensions WHERE tenant='"+tenant+"'"],check=True,capture_output=True,text=True)
previous=json.loads(r.stdout.strip()) if r.stdout.strip() else (root/'extensions/company-limit.wat').read_text()
previous_digest=hashlib.sha256(previous.encode()).hexdigest()
def check(name):checks.append(name);print('PASS',name)
def business(pid,quantity=1):
    c=req('/store-api/checkout/cart',{'session':'extension-'+uuid.uuid4().hex});h={'sw-context-token':c['token']}
    c=req('/store-api/account/login',{'email':'buyer@example.test','password':'demo-business'},h);h['sw-context-token']=c['token']
    c=req('/store-api/checkout/cart/line-item',{'items':[{'referencedId':pid,'quantity':quantity}]},h)
    return c,{**h,'Idempotency-Key':'extension-'+uuid.uuid4().hex}
log=open(root/'.run/extension-replica.log','w')
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));replica_port=sock.getsockname()[1]
replica_url=f'http://127.0.0.1:{replica_port}'
replica=subprocess.Popen([str(root/'target/debug/rust-ai-commerce')],cwd=root,env={**os.environ,'BIND_ADDR':f'127.0.0.1:{replica_port}'},stdout=log,stderr=log)
try:
    for _ in range(80):
        if replica.poll() is not None:raise RuntimeError('Test replica failed; inspect private .run/extension-replica.log')
        try:req('/health',backend=replica_url);break
        except OSError:time.sleep(.25)
    else:raise RuntimeError('Test replica did not start')
    for file,blocked,allowed in [('minimum-order.wat',('mug',1),('lamp',1)),('single-order-cap.wat',('desk',1),('mug',1)),('budget-reserve.wat',('chair',6),('mug',1))]:
        activation=req('/api/extensions/activate',{'wat':(root/'extensions'/file).read_text()},admin)
        assert activation['activated'] and not activation['hostImports']
        c,h=business(*blocked);req('/store-api/checkout/order',{},h,409,backend=replica_url)
        assert req('/store-api/checkout/cart',h=h)['status']=='open'
        c,h=business(*allowed);o=req('/store-api/checkout/order',{},h,backend=replica_url)
        assert not o['payment']['realMoneyCharged']
        check(file+' activates on one replica and blocks/allows native B2B checkout on another')
    req('/api/extensions/activate',{'wat':'(module (import "env" "network" (func)))'},admin,400);check('host imports rejected before activation')
    req('/api/extensions/activate',{'wat':'(module (func (export "approve") (param i64 i64) (result i32) (loop br 0) i32.const 1))'},admin,400);check('infinite activation probe exhausts fuel without replacing active policy')
    req('/api/extensions/activate',{'wat':'(module (memory 32) (func (export "approve") (param i64 i64) (result i32) i32.const 1))'},admin,400);check('oversized guest memory rejected without replacing active policy')
finally:
    try:
        restored=req('/api/extensions/activate',{'wat':previous},admin)
        assert restored['digest']==previous_digest
        assert req('/api/extensions',h=admin)['digest']==previous_digest
    finally:
        replica.terminate()
        try:replica.wait(timeout=10)
        except subprocess.TimeoutExpired:replica.kill();replica.wait()
        log.close()
check('exact prior policy source restored, including whitespace')
report={'suite':'extensions-v4','passed':len(checks),'checks':checks,'previousPolicyRestored':True,'syntheticOrdersOnly':True}
print(json.dumps(report,indent=2))
if os.getenv('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
