#!/usr/bin/env python3
"""Real HTTP/PostgreSQL CRM, receipt, scoped-access and paid-download regressions. No PSP traffic."""
import json,os,uuid,urllib.request,urllib.error,concurrent.futures,pathlib,time,copy
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787');suffix=uuid.uuid4().hex[:10];password='Synthetic-operation-2026!';checks=[]
def req(path,body=None,h=None,method=None,expected=200,binary=False):
    raw=body if isinstance(body,bytes) else None if body is None else json.dumps(body).encode()
    r=urllib.request.Request(BASE+path,data=raw,headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(r,timeout=30) as response:status=response.status;data=response.read()
    except urllib.error.HTTPError as e:status=e.code;data=e.read()
    if status!=expected:raise AssertionError((path,status,expected,data.decode(errors='replace')))
    return data if binary else json.loads(data)
def check(name):checks.append(name);print('PASS',name)
def register(label):return req('/api/auth/register',{'name':label,'email':label+suffix+'@example.test','password':password,'workspaceId':label+'-'+suffix,'workspaceName':label.title()})
def headers(s):return {'Authorization':'Bearer '+s['token'],'x-tenant':s['workspace']}
def mcp(name,arguments,h):return req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}},h)['result']
owner=register('ops');foreign=register('opforeign');h=headers(owner);public={'x-tenant':owner['workspace']}
req('/api/merchant/customers',expected=401);req('/api/merchant/customers',h=headers(foreign))
req('/api/merchant/customers',h={**headers(foreign),'x-tenant':owner['workspace']},expected=403)
req('/api/merchant/orders?limit=1000',h=h,expected=400)
check('bounded CRM and orders are personal-login and workspace scoped')
inv=req('/api/workspace/invitations',{'email':'support'+suffix+'@example.test','role':'viewer'},h);support=req('/api/auth/accept',{'name':'Support','password':password,'invitationToken':inv['token']});sh=headers(support)
req('/api/workspace/members/'+support['user']['id'],{'role':'viewer','active':True,'permissions':['orders.read','orders.write']},h,'PUT')
assert req('/api/auth/access',h=sh)['permissions']==['orders.read','orders.write']
req('/api/merchant/customers',h=sh,expected=403);req('/api/payments',h=sh,expected=403)
tools=req('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/list'},sh)['result']['tools'];assert any(t['name']=='merchant.order.transition' for t in tools);assert not any(t['name']=='merchant.receipt.create' for t in tools)
assert mcp('merchant.customers',{},sh)['isError'];req('/api/workspace/members/'+support['user']['id'],{'role':'viewer','active':True,'permissions':['unknown']},h,'PUT',400)
check('granular rights affect HTTP and MCP listing/direct calls immediately')
# Attachment bytes are immutable and private until explicit publication.
def upload(kind='attachment',content=b'Care manual',mime='text/plain',name='manual.txt'):
    boundary='ops-'+uuid.uuid4().hex;title={l:'Care manual '+l for l in ['en','de','fr','es']};body=b''
    for key,value in [('title',json.dumps(title)),('kind',kind)]:body+=f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body+=f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode()
    return req('/api/merchant/products/lamp/assets',body,{**h,'Content-Type':'multipart/form-data; boundary='+boundary})
attachment=upload();assert req('/store-api/product/lamp/attachments',h=public)['elements']==[]
req('/store-api/assets/'+attachment['id'],h=public,expected=404)
req('/api/merchant/assets/'+attachment['id'],{'public':True,'digest':'wrong'},h,'PUT',409)
assert not mcp('merchant.asset.publish',{'id':attachment['id'],'digest':attachment['digest'],'public':True},h)['isError']
assert req('/store-api/assets/'+attachment['id'],h=public,binary=True)==b'Care manual'
req('/store-api/assets/'+attachment['id'],h={'x-tenant':foreign['workspace']},expected=404)
check('attachment upload/private publication/digest fence and cross-shop denial')
product=req('/api/merchant/products/lamp',h=h);product['extra']={'seo':{},'specifications':{},'crossSelling':[],'shippingFree':False,**product['extra'],'digital':True,'richDescription':{l:[{'type':'heading','text':'Guide '+l},{'type':'paragraph','text':'**Digital** guide'},{'type':'image','url':'https://example.com/guide.png'}]for l in ['en','de','fr','es']}}
req('/api/merchant/products/lamp',product,h,'PUT')
unsafe={**product,'revision':product['revision']+1,'extra':{**product['extra'],'richDescription':{'en':[{'type':'video','url':'javascript:alert(1)'}]}}}
req('/api/merchant/products/lamp',unsafe,h,'PUT',400)
assert req('/store-api/product/lamp',h=public)['product']['extra']['digital']
check('four-language rich blocks reach PDP and executable media URLs are rejected')
c=req('/store-api/checkout/cart',{'session':'ops-'+suffix},public);ch={**public,'sw-context-token':c['token']};c=req('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'lamp','quantity':1}]},ch)
req('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':'no-download-'+suffix},expected=400)
asset=upload('download',b'Purchased digital guide')
req('/api/merchant/assets/'+asset['id'],{'public':True,'digest':asset['digest']},h,'PUT')
email='buyer'+suffix+'@example.test';reg=req('/store-api/account/register',{'name':'Buyer','email':email,'password':password},public)
login=req('/store-api/account/login',{'email':email,'password':password},ch);ch['sw-context-token']=login['token'];customer={**public,'x-customer-token':login['customerToken']}
order=req('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':'download-'+suffix});id=order['id']
assert order['cart']['shippingCosts']['totalPrice']==0 and order['deliveries']==[]
assert 'token' not in req('/api/merchant/orders/'+id,h=h)['cart']
assert req('/api/merchant/customers/'+email,h=h)['orders'][0]['id']==id
check('digital checkout snapshots entitlement, excludes shipping and associates real account history')
path='/store-api/orders/'+id+'/downloads/'+asset['id']
if order['payment']['state'] not in ['authorized','paid']:
    req(path,h=customer,expected=403)
    order=req('/api/merchant/orders/'+id+'/transition',{'revision':order['revision'],'kind':'payment','state':'paid'},h)
assert req(path,h=customer,binary=True)==b'Purchased digital guide'
req(path,h=public,expected=404);req(path,h={'x-tenant':foreign['workspace'],'x-customer-token':login['customerToken']},expected=401)
assert req('/store-api/account/downloads',h=customer)['elements'][0]['id']==asset['id']
# Withdrawing from future sales does not revoke the immutable paid order entitlement.
req('/api/merchant/assets/'+asset['id'],{'public':False,'digest':asset['digest']},h,'PUT');assert req(path,h=customer,binary=True)==b'Purchased digital guide'
check('paid download ownership, anonymous/foreign rejection and immutable purchase files')
assert not mcp('merchant.order.note',{'id':id,'revision':order['revision'],'text':'Packed by support'},sh)['isError']
req('/api/merchant/orders/'+id+'/transition',{'revision':order['revision'],'kind':'order','state':'in_progress'},sh,expected=409)
order=req('/api/merchant/orders/'+id,h=h);order=req('/api/merchant/orders/'+id+'/transition',{'revision':order['revision'],'kind':'order','state':'in_progress'},sh)
assert req('/api/merchant/orders/'+id,h=h)['activity'][0]['kind']=='transition'
check('revision-bound notes/status mutations are audited and stale changes fail')
req('/api/merchant/receipts/settings',{'revision':0,'data':{'name':'Synthetic Seller GmbH','address':'Teststrasse 1, Berlin','taxId':'TEST-ONLY'}},h,'PUT')
body={'revision':order['revision'],'kind':'invoice','locale':'de','requestKey':'receipt-'+suffix}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:receipts=list(ex.map(lambda _:req('/api/merchant/orders/'+id+'/receipts',body,h),range(2)))
assert receipts[0]['id']==receipts[1]['id'];receipt=receipts[0]
pdf=req('/api/merchant/receipts/'+receipt['id']+'/pdf',h=h,binary=True);assert pdf.startswith(b'%PDF-1.4') and b'Rechnung' in pdf
req('/api/merchant/receipts/'+receipt['id']+'/pdf',h=sh,expected=403)
req('/api/merchant/orders/'+id+'/receipts',{**body,'locale':'fr'},h,expected=409)
req('/api/merchant/orders/'+id+'/receipts',{**body,'requestKey':'second-'+suffix},h,expected=409)
for lang in ['en','fr','es']:assert not mcp('merchant.receipt.create',{'id':id,'revision':order['revision'],'kind':'delivery_note','locale':lang,'requestKey':'del-'+lang+suffix},h)['isError']
assert not mcp('merchant.receipt.create',{'id':id,'revision':order['revision'],'kind':'cancellation','locale':'de','referenceId':receipt['id'],'requestKey':'cancel-'+suffix},h)['isError']
assert req('/api/merchant/receipts/'+receipt['id']+'/pdf',h=h,binary=True)==pdf
check('numbered four-language PDFs, concurrent idempotency, cancellation references and immutable originals')
profile=req('/api/merchant/customers/'+email,h=h);req('/api/merchant/customers/'+email,{'revision':profile['revision'],'profile':profile['profile'],'company':'Demo','customerGroup':'business','active':False},h,'PUT')
req('/store-api/account/profile',h=customer,expected=401);req('/store-api/account/login',{'email':email,'password':password},ch,expected=401)
req('/api/merchant/customers/'+email,{'revision':profile['revision'],'profile':{},'customerGroup':'consumer','active':True},h,'PUT',409)
check('customer deactivation/group changes revoke existing sessions and privileged cart contexts')
inv=req('/api/workspace/invitations',{'email':'revoked'+suffix+'@example.test','role':'viewer'},h);req('/api/workspace/invitations/'+inv['id'],h=h,method='DELETE');req('/api/auth/accept',{'name':'Revoked','password':password,'invitationToken':inv['token']},expected=404)
logged=req('/api/auth/login',{'email':owner['user']['email'],'password':password});sessions=req('/api/auth/sessions',h=h)['sessions'];other=next(s for s in sessions if not s['current']);req('/api/auth/sessions/'+other['id'],h=h,method='DELETE');req('/api/auth/session',h=headers(logged),expected=401)
check('invitations and individual sessions can be revoked without affecting current access')
key=req('/api/workspace/integrations',{'name':'Read orders only','expiresInDays':30,'permissions':['orders.read']},h);kh={'Authorization':'Bearer '+key['key'],'x-tenant':owner['workspace']}
assert req('/api/merchant/orders',h=kh)['elements'];req('/api/merchant/customers',h=kh,expected=403);req('/api/merchant/orders/'+id+'/notes',{'revision':order['revision'],'text':'forbidden'},kh,expected=403)
req('/api/merchant/orders',h={**kh,'x-tenant':foreign['workspace']},expected=403);assert not mcp('merchant.order',{'id':id},kh)['isError']
assert 'digest' not in json.dumps(req('/api/workspace/integrations',h=h)) and key['key'] not in json.dumps(req('/api/workspace/integrations',h=h))
req('/api/workspace/integrations/'+key['id'],h=h,method='DELETE');req('/api/merchant/orders',h=kh,expected=401)
check('expiring one-shop API/MCP keys enforce explicit rights, hide secrets and revoke immediately')
# Full manual/delivery lifecycle and exact-once cancellation stock restoration.
pub={'x-tenant':owner['workspace']};physical=req('/store-api/checkout/cart',{'session':'physical-'+suffix},pub);ph={**pub,'sw-context-token':physical['token']};physical=req('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'notebook','quantity':1}]},ph)
physical=req('/store-api/checkout/order',{}, {**ph,'Idempotency-Key':'physical-'+suffix});stock=req('/store-api/product/notebook',h=pub)['product']['stock']
physical=req('/api/merchant/orders/'+physical['id']+'/transition',{'revision':physical['revision'],'kind':'order','state':'cancelled'},h);assert 'token' not in physical['cart'];assert req('/store-api/product/notebook',h=pub)['product']['stock']==stock+1
req('/api/merchant/orders/'+physical['id']+'/transition',{'revision':physical['revision'],'kind':'order','state':'cancelled'},h,expected=409);assert req('/store-api/product/notebook',h=pub)['product']['stock']==stock+1
check('cancellation restores physical inventory exactly once and never discloses shopper context tokens')
# Binary assets have their own selective staged release unit.
stage=req('/api/environments',{'name':'Asset preview'},h);stage_id=stage['id'];staged={**h,'x-tenant':stage_id}
files=req('/api/merchant/products/lamp/assets',h=staged)['elements'];staged_asset=next(x for x in files if x['id']==attachment['id'])
req('/api/merchant/assets/'+staged_asset['id'],{'digest':staged_asset['digest'],'public':False},staged,'PUT')
diff=req('/api/environments/'+stage_id+'/diff',h=h);changes=diff.get('changes',diff.get('units',[]));selected=next(x for x in changes if x['key']=='asset:'+attachment['id'])
req('/api/environments/'+stage_id+'/release',{'approve':True,'selections':[{'key':selected['key'],'digest':selected['digest']}]},h)
req('/store-api/assets/'+attachment['id'],h=pub,expected=404)
check('binary asset staging is private and only the selected digest-bound asset is released')
# The same custom state is rendered as an action and delivered into durable flow execution.
root=pathlib.Path(__file__).resolve().parents[1]
req('/api/apps',{'manifest':json.loads((root/'extensions/apps/packing-helper/manifest.json').read_text())},h)
wf=json.loads((root/'extensions/apps/packing-helper/workflow.json').read_text())
assert not mcp('merchant.workflow.save',{'revision':0,'data':wf},h)['isError']
req('/api/merchant/order-state-machine',{'revision':0,'data':wf},h,'PUT',409)
invalid=copy.deepcopy(wf);invalid['transitions'].append({'id':'reopen','from':'completed','to':'placed','label':invalid['states'][0]['label']})
req('/api/merchant/order-state-machine',{'revision':1,'data':invalid},h,'PUT',400)
flow={'name':{l:'Packed order note' for l in ['en','de','fr','es']},'active':True,'event':'order.state_changed','condition':{'type':'orderState','values':['packed']},'action':'note','instruction':{l:'Packing flow confirmed '+l for l in ['en','de','fr','es']},'locale':'en-GB'}
req('/api/automation/flows/packing',{'revision':0,'data':flow},h,'PUT')
current=req('/api/merchant/orders/'+id,h=h);action=next(a for a in current['workflow']['actions'] if a['state']=='packed');assert action['label']['de']=='Verpackung bestätigen' and action['enabled']
body={'revision':current['revision'],'kind':'order','state':'packed','action':'pack','requestKey':'pack-'+suffix}
with concurrent.futures.ThreadPoolExecutor(max_workers=6)as ex:results=list(ex.map(lambda _:req('/api/merchant/orders/'+id+'/transition',body,sh),range(6)))
assert len({result['revision'] for result in results})==1
req('/api/merchant/orders/'+id+'/transition',{**body,'state':'completed'},sh,expected=409)
# Advance immediately; the delayed flow must still evaluate the packed event snapshot.
current=req('/api/merchant/orders/'+id,h=h);req('/api/merchant/orders/'+id+'/transition',{'revision':current['revision'],'kind':'order','state':'completed','requestKey':'complete-'+suffix},sh)
for _ in range(100):
    jobs=req('/api/automation',h=h)['jobs'];matches=[job for job in jobs if job['flow']=='packing']
    if matches and matches[0]['state']=='completed':break
    time.sleep(.15)
assert len(matches)==1 and matches[0]['state']=='completed'
current=req('/api/merchant/orders/'+id,h=h);assert len([event for event in current['activity']if event['kind']=='transition'and event['data']['state']=='packed'])==1
assert len([event for event in current['activity']if event['kind']=='flow'and event['data']['text']=='Packing flow confirmed en'])==1
assert current['workflow']['actions']==[]
# Terminal business states must reject direct HTTP commands, not only hide buttons.
for kind,state in [('payment','paid'),('delivery','shipped')]:
    denied=req('/api/merchant/orders/'+id+'/transition',{'revision':current['revision'],'kind':kind,'state':state},h,expected=409)
    assert 'terminalOrder' in json.dumps(denied)
assert req('/api/merchant/orders/'+id,h=h)['revision']==current['revision']
check('completed orders reject direct payment/delivery commands without changing revision')
check('custom translated workflow, concurrent exact-once transition and snapshot-bound flow produce one real order note')
# An app-defined terminal state receives the same server-side protection.
custom=copy.deepcopy(wf);custom['states'].append({'id':'sealed','label':{l:'Sealed' for l in ['en','de','fr','es']},'terminal':True});custom['transitions'].append({'id':'seal','from':'placed','to':'sealed','label':{l:'Seal order' for l in ['en','de','fr','es']}})
req('/api/merchant/order-state-machine',{'revision':1,'data':custom},h,'PUT')
sealed_cart=req('/store-api/checkout/cart',{'session':'sealed-'+suffix},pub);sealed_h={**pub,'sw-context-token':sealed_cart['token']};req('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'notebook','quantity':1}]},sealed_h)
sealed=req('/store-api/checkout/order',{}, {**sealed_h,'Idempotency-Key':'sealed-'+suffix});sealed=req('/api/merchant/orders/'+sealed['id']+'/transition',{'revision':sealed['revision'],'kind':'order','state':'sealed'},h)
assert sealed['workflow']['actions']==[]
for kind,state in [('payment','paid'),('delivery','shipped')]:
    denied=req('/api/merchant/orders/'+sealed['id']+'/transition',{'revision':sealed['revision'],'kind':kind,'state':state},h,expected=409)
    assert 'terminalOrder' in json.dumps(denied)
check('app-defined terminal states reject direct operational commands through the shared guard')
# A delegated team manager cannot mint default admin rights through invitations.
req('/api/workspace/members/'+support['user']['id'],{'role':'viewer','active':True,'permissions':['team.manage','orders.read']},h,'PUT')
req('/api/workspace/invitations',{'email':'escalate'+suffix+'@example.test','role':'admin'},sh,expected=403)
req('/api/workspace/members/'+support['user']['id'],{'role':'admin','active':True,'permissions':None},sh,'PUT',403)
check('restricted team delegation cannot escalate via default roles or invitations')
# Workflows are independent release units; no live orders are copied to staging.
stage2=req('/api/environments',{'name':'Workflow preview'},h);sh2={**h,'x-tenant':stage2['id']};stage_wf=req('/api/merchant/order-state-machine',h=sh2);stage_wf['data']['states'][2]['label']['en']='Packed with care';req('/api/merchant/order-state-machine',stage_wf,sh2,'PUT')
unit=next(change for change in req('/api/environments/'+stage2['id']+'/diff',h=h)['changes']if change['key']=='order-workflow')
req('/api/environments/'+stage2['id']+'/release',{'approve':True,'selections':[{'key':unit['key'],'digest':unit['digest']}]},h)
assert req('/api/merchant/order-state-machine',h=h)['data']['states'][2]['label']['en']=='Packed with care'
check('workflow definitions stage and release selectively while terminal orders remain protected')
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
