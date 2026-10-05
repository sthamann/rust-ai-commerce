#!/usr/bin/env python3
"""Real HTTP company basis/channel inheritance, immutable issuer snapshots, bounded logos and private staging. No external services."""
import base64,concurrent.futures,copy,json,os,struct,urllib.request,urllib.error,uuid,zlib
BASE=os.getenv('BASE_URL','http://127.0.0.1:8787');tag=uuid.uuid4().hex[:10]
def call(path,body=None,h=None,method=None,status=200,binary=False):
    raw=body if isinstance(body,bytes) else None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(BASE+path,data=raw,headers={'Content-Type':'application/json',**(h or {})},method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(req,timeout=30) as response:code=response.status;data=response.read()
    except urllib.error.HTTPError as e:code=e.code;data=e.read()
    assert code==status,(path,code,status,data.decode(errors='replace')[:500])
    return data if binary else json.loads(data)
def register(prefix):
    v=call('/api/auth/register',{'name':'Synthetic Company Owner','email':prefix+tag+'@example.test','password':'Company-test-password-2026!','workspaceId':prefix+'-'+tag,'workspaceName':'Synthetic Company Shop'})
    return v,{'Authorization':'Bearer '+v['token'],'x-tenant':v['workspace']}
owner,h=register('company');other,fh=register('companyother');tenant=owner['workspace'];public={'x-tenant':tenant}
base={'name':'Synthetic Seller GmbH','street':'Example Road','houseNumber':'12A','postalCode':'10115','city':'Berlin','country':'DE','countryStateId':'DE-BE','taxId':'PRIVATE-TAX','vatId':'DE-DEMO','legalForm':'GmbH','registerType':'HRB','registrationNumber':'DEMO-123','registerCourt':'Synthetic Court','managingDirectors':'Alex Example','contentResponsible':'Jordan Example','contentResponsibleAddress':'Editorial Road 3, Berlin','email':'office@example.test','phoneNumber':'111','bankName':'Private bank','iban':'PRIVATE-IBAN','brandName':{'es':'Marca base'},'legalNotice':{'es':'Aviso original','de':''}}
# Spanish main-language fallback is different from interface language.
config=call('/api/merchant/commerce',h=h);config['data']['mainLocale']='es-ES';world=call('/store-api/countries',h=public);definition=copy.deepcopy(next(c for c in world['countries'] if c['code']=='DE'));definition['states']=[{'code':'DE-BE','name':{'en':'Berlin','de':'Berlin','es':'Berlín','fr':'Berlin'}}];config['data']['countryDefinitions']=[definition];call('/api/merchant/commerce',config,h,'PUT')
saved=call('/api/settings/master-data',{'revision':0,'data':base},h,'PUT');assert saved['revision']==1 and saved['data']['address']=='Example Road 12A, 10115 Berlin, DE-BE, DE'
base=saved['data'];assert call('/api/merchant/receipts/settings',h=h)==saved
call('/api/settings/master-data',{'revision':1,'data':{**base,'countryStateId':'US-CA'}},h,'PUT',400)
call('/api/settings/master-data',{'revision':1,'data':{**base,'website':'javascript:alert(1)'}},h,'PUT',400)
call('/api/settings/master-data',{'revision':0,'data':base},h,'PUT',409)
call('/api/settings/master-data',h={**fh,'x-tenant':tenant},status=403)
for channel in ['north','south']:
    call('/api/automation/channels/'+channel,{'revision':0,'data':{'name':{'es':channel},'kind':'storefront','active':True,'locales':['en-GB','de-DE','es-ES','fr-FR'],'productIds':['mug']}},h,'PUT')
path='/api/settings/master-data/channels/north';north=call(path,h=h);assert north['data']=={} and north['baseRevision']==1
north['data']={'name':'Synthetic North GmbH','phoneNumber':'','brandName':{'de':'Nord Marke','es':None},'houseNumber':'99'}
north=call(path,north,h,'PUT');assert north['effective']['phoneNumber']=='' and north['effective']['brandName']['es']=='Marca base' and north['effective']['address'].startswith('Example Road 99')
assert call('/api/settings/master-data/channels/south',h=h)['effective']['name']==base['name']
call('/api/settings/master-data/channels/missing',h=h,status=404)
call('/api/settings/master-data/channels/default',h=h,status=400)
call(path,{'revision':1,'baseRevision':0,'data':{}},h,'PUT',409)
localized=call('/store-api/company',h={**public,'sw-sales-channel-id':'north','x-commerce-locale':'de-DE'})['data'];assert localized['brandName']=='Nord Marke' and localized['legalNotice']=='' and 'iban' not in localized and 'taxId' not in localized
assert call('/store-api/company',h={**public,'sw-sales-channel-id':'south','x-commerce-locale':'en-GB'})['data']['brandName']=='Marca base'
print('PASS structured addresses, main-language fallback, private field projection and sparse two-channel inheritance')
# Valid decoder fixture, not a signature-only fake PNG.
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',4,3,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\x16\x6b\xf5\xff'*4)*3))+chunk(b'IEND',b'')
def upload(content,mime='image/png',headers=h,status=200):
    boundary='company-'+uuid.uuid4().hex
    body=f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: {mime}\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode()
    return call('/api/settings/company-logo',body,{**headers,'Content-Type':'multipart/form-data; boundary='+boundary},status=status)
logo=upload(png);assert upload(png)['id']==logo['id'];preview=call('/api/settings/company-logo/'+logo['id'],h=h);assert base64.b64decode(preview['dataUrl'].split(',')[1]).startswith(b'\x89PNG')
call('/api/settings/company-logo/'+logo['id'],h=fh,status=404)
call('/store-api/company-logo/'+logo['id']+'?shop='+tenant,status=404,binary=True)
upload(b'<svg onload="bad()"/>','image/svg+xml',status=400);upload(png[:20],status=400)
foreign_logo=upload(png,headers=fh)
call('/api/settings/master-data',{'revision':1,'data':{**base,'logoId':foreign_logo['id']}},h,'PUT',400)
base=call('/api/settings/master-data',{'revision':1,'data':{**base,'logoId':logo['id']}},h,'PUT')['data']
image=call('/store-api/company-logo/'+logo['id']+'?shop='+tenant+'&channel=north',binary=True);assert image.startswith(b'\x89PNG')
call(path,{'revision':1,'baseRevision':1,'data':{}},h,'PUT',409)
north=call(path,h=h);north['data']={'name':None,'phoneNumber':None,'logoId':''};north=call(path,north,h,'PUT');assert north['effective']['name']==base['name'] and north['effective']['phoneNumber']=='111'
call('/store-api/company-logo/'+logo['id']+'?shop='+tenant+'&channel=north',status=404,binary=True)
assert call('/store-api/company',h={**public,'sw-sales-channel-id':'north'})['data'].get('logoUrl') is None
print('PASS bounded decoded logo upload, private preview, tenant isolation, linked public delivery and channel-specific removal')
# Order channel selects the effective issuer and cancellation preserves the original issuer.
north=call(path,h=h);north['data']={'name':'Synthetic North GmbH','registrationNumber':'NORTH-456'};north=call(path,north,h,'PUT')
ch={**public,'sw-sales-channel-id':'north'};cart=call('/store-api/checkout/cart',{'session':'company-'+tag},ch);ch['sw-context-token']=cart['token'];call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},ch)
order=call('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':'company-order-'+tag});assert order['salesChannelId']=='north'
receipt=call('/api/merchant/orders/'+order['id']+'/receipts',{'revision':order['revision'],'kind':'invoice','locale':'en','requestKey':'company-invoice-'+tag},h)
pdf=call(receipt['pdfPath'],h=h,binary=True);assert b'Synthetic North GmbH' in pdf and b'NORTH-456' in pdf and b'Example Road 12A' in pdf
north=call(path,h=h);north['data']['name']='Changed Seller';call(path,north,h,'PUT')
assert call(receipt['pdfPath'],h=h,binary=True)==pdf
cancel=call('/api/merchant/orders/'+order['id']+'/receipts',{'revision':order['revision'],'kind':'cancellation','locale':'en','requestKey':'company-cancel-'+tag,'referenceId':receipt['id']},h)
assert b'Synthetic North GmbH' in call(cancel['pdfPath'],h=h,binary=True)
result=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'merchant.company','arguments':{'channelId':'north'}}},h)['result'];assert not result.get('isError')
print('PASS actual channel checkout, correct legal issuer PDF, immutable invoice/cancellation and MCP company access')
# Two concurrent writers cannot overwrite one another.
record=call('/api/settings/master-data',h=h)
def race(i):
    try:return call('/api/settings/master-data',{**record,'data':{**record['data'],'email':str(i)+'@example.test'}},h,'PUT')['revision']
    except AssertionError as e:assert e.args[0][1]==409;return 'conflict'
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(race,range(2)))
assert sum(v=='conflict' for v in results)==1
stage=call('/api/environments',{'name':'Company test stage'},h);stageh={**h,'x-tenant':stage['id']}
assert call('/api/settings/master-data',h=stageh)['data']['logoId']==logo['id']
assert call('/api/settings/master-data/channels/north',h=stageh)['effective']['name']=='Changed Seller'
call('/store-api/company-logo/'+logo['id']+'?shop='+stage['id'],status=401,binary=True)
print('PASS concurrent revision guard and cloned company/channel/logo configuration remains private in staging')

# Only a selected company/channel unit is published; a second edit compares the actual baseline.
staged=call('/api/settings/master-data/channels/north',h=stageh);staged['data']['name']='Staged North GmbH';call('/api/settings/master-data/channels/north',staged,stageh,'PUT')
stagedbase=call('/api/settings/master-data',h=stageh);stagedbase['data']['email']='staged@example.test';call('/api/settings/master-data',stagedbase,stageh,'PUT')
diff=call('/api/environments/'+stage['id']+'/diff',h=h);selection=next(c for c in diff['changes'] if c['key']=='company-channel:north')
call('/api/environments/'+stage['id']+'/release',{'approve':True,'selections':[{'key':selection['key'],'digest':selection['digest']}]},h)
assert call('/api/settings/master-data/channels/north',h=h)['effective']['name']=='Staged North GmbH'
assert call('/api/settings/master-data',h=h)['data']['email']!='staged@example.test'
# Same new image may have different private IDs in staging/live: release must rebind to owned live bytes.
# Regenerate a different valid image instead of corrupting a CRC.
alt=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',4,3,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\xf5\x16\x6b\xff'*4)*3))+chunk(b'IEND',b'')
stagelogo=upload(alt,headers=stageh);livelogo=upload(alt);assert stagelogo['id']!=livelogo['id']
stagedbase=call('/api/settings/master-data',h=stageh);stagedbase['data']['logoId']=stagelogo['id'];call('/api/settings/master-data',stagedbase,stageh,'PUT')
diff=call('/api/environments/'+stage['id']+'/diff',h=h);selection=next(c for c in diff['changes'] if c['key']=='company')
call('/api/environments/'+stage['id']+'/release',{'approve':True,'selections':[{'key':selection['key'],'digest':selection['digest']}]},h)
assert call('/api/settings/master-data',h=h)['data']['logoId']==livelogo['id']
stagedbase=call('/api/settings/master-data',h=stageh);stagedbase['data']['email']='second-stage@example.test';call('/api/settings/master-data',stagedbase,stageh,'PUT')
diff=call('/api/environments/'+stage['id']+'/diff',h=h);selection=next(c for c in diff['changes'] if c['key']=='company');assert not selection['conflict']
call('/api/environments/'+stage['id']+'/release',{'approve':True,'selections':[{'key':selection['key'],'digest':selection['digest']}]},h)
assert call('/api/settings/master-data',h=h)['data']['email']=='second-stage@example.test'
print('PASS selective company/channel release, duplicate logo rebinding and a second release against the real live baseline')
