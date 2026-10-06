#!/usr/bin/env python3
"""Real HTTP/PostgreSQL catalog creation, categories, multilingual editor, visibility and staging regressions. Synthetic isolated shops only."""
import base64,copy,json,os,time,urllib.request,urllib.error,uuid,concurrent.futures
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8787');public={};merchant={};checks=[]
def req(path,body=None,h=None,method=None,expected=200):
 r=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**public,**(h or {})},method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(r,timeout=30) as response:status=response.status;data=json.load(response)
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 assert status==expected,(path,status,expected,data)
 return data
def check(name):checks.append(name);print('PASS',name)
suffix=uuid.uuid4().hex[:12]
w=req('/api/auth/register',{'workspaceId':'catalog-'+suffix,'workspaceName':'Catalog regression','name':'Synthetic Owner','email':'catalog-'+suffix+'@example.test','password':'Synthetic-catalog-2026!'})
public={'x-tenant':w['workspace']};merchant={**public,'Authorization':'Bearer '+w['token']}
root=req('/api/merchant/categories',h=merchant)['elements'];assert any(c['id']=='catalog-root' for c in root);check('new shop receives its own category tree')
def category(name,parent='catalog-root',active=True):
 return req('/api/merchant/categories',{'revision':None,'parentId':parent,'position':0,'data':{'active':active,'visible':True,'type':'page','translations':{l:{'name':name+'-'+l,'description':'Synthetic category','slug':name.lower()+'-'+l} for l in ['en','de','fr','es']}}},merchant)['id']
parent=category('Parent');child=category('Child',parent);foreign=category('Private',active=False)
draft=req('/api/merchant/products/chair',h=merchant)
for k in ['id','channels']:draft.pop(k,None)
draft['revision']=0;draft['catalog'].update({'active':True,'productNumber':'CAT-'+suffix,'categoryIds':[child],'parentId':None,'options':{}})
draft['translations']={l:{'name':'Catalog test '+l,'description':'Created through real API '+l} for l in ['en','de','fr','es']}
draft['commerce'].update({'price':39.9,'stock':7,'media':[],'properties':{'material':'oak'}})
draft['extra']={**{'seo':{},'specifications':{},'crossSelling':[],'shippingFree':False,'digital':False,'automation':{}},**draft['extra']}
draft['extra'].update({'richDescription':{'de':[{'type':'document','doc':{'type':'doc','content':[{'type':'heading','attrs':{'level':2},'content':[{'type':'text','text':'Visuell'}]},{'type':'paragraph','content':[{'type':'text','text':'Formatted description','marks':[{'type':'bold'}]}]}]}}]},'identity':{'manufacturer':'Synthetic brand','ean':'1234567890123'}})
# Actual TipTap Markdown transport shape, including numbered lists, code, quotes and links.
draft['extra']['richDescription']['en']=[{'type':'document','doc':{'type':'doc','content':[
 {'type':'orderedList','attrs':{'start':1},'content':[{'type':'listItem','content':[{'type':'paragraph','content':[{'type':'text','text':'First'}]}]}]},
 {'type':'codeBlock','attrs':{'language':'rust'},'content':[{'type':'text','text':'let x = 1;'}]},
 {'type':'blockquote','content':[{'type':'paragraph','content':[{'type':'text','text':'Care guide'}]}]},
 {'type':'paragraph','content':[{'type':'text','text':'Guide','marks':[{'type':'link','attrs':{'href':'https://example.test/guide','target':'_blank','rel':'noopener noreferrer nofollow'}}]}]},
 {'type':'horizontalRule'}]}}]

req('/api/merchant/products',draft,expected=401)
created=req('/api/merchant/products',draft,merchant);pid=created['id'];assert created['revision']==1
assert req('/store-api/product/'+pid,{})['product']['product_number']==draft['catalog']['productNumber']
saved=req('/api/merchant/products/'+pid,h=merchant);assert saved['extra']['richDescription']==draft['extra']['richDescription'] and saved['catalog']['categoryIds']==[child];check('one atomic creation persists commerce, all translations, rich document and categories')
req('/api/merchant/products',draft,merchant,expected=409)
assert len(req('/api/merchant/products?search='+draft['catalog']['productNumber'],h=merchant)['elements'])==1
assert req('/api/merchant/products?limit=101',h=merchant,expected=400)
first=req('/api/merchant/products?limit=2',h=merchant);second=req('/api/merchant/products?limit=2&after='+first['nextCursor'],h=merchant);assert not set(p['id'] for p in first['elements'])&set(p['id'] for p in second['elements']);check('server search, bounded filtering and cursor pagination work without duplicates')
nav=req('/store-api/navigation',{},h={'x-commerce-locale':'de-DE'})['elements'];assert any(c['id']==child and c['name']=='Child-de' for c in nav) and not any(c['id']==foreign for c in nav)
listing=req('/store-api/product',{'categoryId':parent})['elements'];assert pid in [p['id'] for p in listing];check('translated public navigation and parent listings include child-category products')
req('/store-api/product',{'categoryId':foreign},expected=404)
cat=next(c for c in req('/api/merchant/categories',h=merchant)['elements'] if c['id']==parent)
req('/api/merchant/categories/'+parent,{'revision':cat['revision'],'parentId':child,'position':0,'data':cat['data']},merchant,'PUT',400);check('inactive category access and category cycles are rejected')
edit=copy.deepcopy(saved)
for k in ['id','channels']:edit.pop(k,None)
edit['catalog']['active']=False
req('/api/merchant/products/'+pid,edit,merchant,'PUT')
req('/api/merchant/products/'+pid,edit,merchant,'PUT',409)
req('/store-api/product/'+pid,{},expected=404)
assert pid not in [p['id'] for p in req('/store-api/product',{})['elements']]
assert pid in [p['id'] for p in req('/api/merchant/products?active=false',h=merchant)['elements']];check('deactivation affects detail and public lists while remaining editable; stale saves fail')
edit['revision']+=1;edit['catalog']['active']=True;edit['catalog']['categoryIds']=['missing-category']
req('/api/merchant/products/'+pid,edit,merchant,'PUT',400)
assert req('/api/merchant/products/'+pid,h=merchant)['revision']==2;check('invalid associations roll back the entire edit')
edit['catalog']['categoryIds']=[child];edit['extra']['richDescription']['de'][0]['doc']={'type':'image','attrs':{'src':'javascript:alert(1)'}}
req('/api/merchant/products/'+pid,edit,merchant,'PUT',400);check('unsafe structured rich content is rejected by the server')
edit['extra']['richDescription']=draft['extra']['richDescription'];req('/api/merchant/products/'+pid,edit,merchant,'PUT')
channel={'name':{l:'Channel '+l for l in ['en','de','fr','es']},'kind':'storefront','active':True,'locales':['en-GB','de-DE','fr-FR','es-ES'],'productIds':[],'navigationCategoryId':parent}
req('/api/automation/channels/catalog_channel',{'revision':0,'data':channel},merchant,'PUT')
saved=req('/api/merchant/products/'+pid,h=merchant);saved.pop('id');saved.pop('channels');saved['catalog']['salesChannelIds']=[];req('/api/merchant/products/'+pid,saved,merchant,'PUT')
ch={'sw-sales-channel-id':'catalog_channel'};assert pid not in [p['id'] for p in req('/store-api/product',{},ch)['elements']];req('/store-api/product/'+pid,{},ch,expected=404)
assert len(req('/store-api/navigation',{},ch)['elements'])==2;check('per-product channel visibility and per-channel category roots affect the public API')
# The persisted main channel now participates in visibility just like additional channels.
req('/store-api/product/'+pid,{},expected=404)
saved=req('/api/merchant/products/'+pid,h=merchant);saved.pop('id');saved.pop('channels');saved['catalog']['salesChannelIds']=['default'];req('/api/merchant/products/'+pid,saved,merchant,'PUT')
variant=copy.deepcopy(draft);variant['catalog'].update({'productNumber':'VAR-'+suffix,'parentId':pid,'options':{'size':'M'},'active':True,'salesChannelIds':['default']});vid=req('/api/merchant/products',variant,merchant)['id']
assert req('/api/merchant/products?parentId='+pid,h=merchant)['elements'][0]['id']==vid
assert any(v['id']==vid for v in req('/store-api/product/'+pid,{})['variants']);check('created variants have a native family and independent product records')
# The real aggregate rejects duplicate combinations and rolls back conflicting edits.
duplicate=copy.deepcopy(variant);duplicate['catalog']['productNumber']='DUP-'+suffix
req('/api/merchant/products',duplicate,merchant,expected=409)
assert len(req('/api/merchant/products?parentId='+pid,h=merchant)['elements'])==1
second=copy.deepcopy(variant);second['catalog'].update({'productNumber':'VAR2-'+suffix,'options':{'size':'L'}})
second_id=req('/api/merchant/products',second,merchant)['id']
second_saved=req('/api/merchant/products/'+second_id,h=merchant);before=copy.deepcopy(second_saved)
for key in ['id','channels','mainLocale','availableLocales']:second_saved.pop(key,None)
second_saved['catalog']['options']={'size':'M'}
req('/api/merchant/products/'+second_id,second_saved,merchant,'PUT',expected=409)
assert req('/api/merchant/products/'+second_id,h=merchant)==before
second_saved['catalog']['options']={}
req('/api/merchant/products/'+second_id,second_saved,merchant,'PUT',expected=400)
check('duplicate variant creation and editing are rejected atomically; empty options cannot erase a family')
def competing_variant(number):
 payload=copy.deepcopy(variant);payload['catalog'].update({'productNumber':number+'-'+suffix,'options':{'size':'XL'}})
 request=urllib.request.Request(BASE+'/api/merchant/products',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json',**merchant},method='POST')
 try:
  with urllib.request.urlopen(request,timeout=30) as response:return response.status
 except urllib.error.HTTPError as e:return e.code
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:assert sorted(pool.map(competing_variant,['RACE1','RACE2']))==[200,409]
check('concurrent variant creation serializes duplicate option combinations')
# Cross-tenant category/product IDs cannot be attached by a second owner.
w2=req('/api/auth/register',{'workspaceId':'catalog-other-'+suffix,'workspaceName':'Other catalog','name':'Synthetic Other','email':'catalog-other-'+suffix+'@example.test','password':'Synthetic-catalog-2026!'})
other={'x-tenant':w2['workspace'],'Authorization':'Bearer '+w2['token']};
foreign_variant=copy.deepcopy(variant);foreign_variant['catalog'].update({'categoryIds':[],'productNumber':'FOREIGN-'+suffix});req('/api/merchant/products',foreign_variant,other,expected=400);
req('/api/merchant/products/'+pid,h=other,expected=404)
invalid=copy.deepcopy(draft);invalid['catalog']['productNumber']='OTHER';req('/api/merchant/products',invalid,other,expected=400);check('tenant boundary protects product reads and category assignments')
stage=req('/api/environments',{'name':'Catalog staging'},merchant)['id'];sh={**merchant,'x-tenant':stage}
assert any(c['id']==child for c in req('/api/merchant/categories',h=sh)['elements'])
s=req('/api/merchant/products/'+pid,h=sh);s.pop('id');s.pop('channels');s['catalog']['productNumber']='STAGED-'+suffix;req('/api/merchant/products/'+pid,s,sh,'PUT')
diff=req('/api/environments/'+stage+'/diff',h=merchant);unit=next(c for c in diff['changes'] if c['key']=='product:'+pid)
req('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':unit['key'],'digest':unit['digest']}]},merchant)
assert req('/api/merchant/products/'+pid,h=merchant)['catalog']['productNumber']=='STAGED-'+suffix;check('private staging clones category associations and selectively releases product identity')
# Native MCP handlers share revision and tenant checks with HTTP.
def mcp(name,args):
 response=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}},merchant)
 assert 'error' not in response,response
 result=response['result']
 assert not result.get('isError'),result
 return result.get('structuredContent') or json.loads(result['content'][0]['text'])
assert any(p['id']==pid for p in mcp('merchant.products',{'search':'STAGED-'+suffix})['elements'])
assert any(c['id']==child for c in mcp('merchant.categories',{})['elements'])
# Native product creation events are actually consumed by the durable flow worker.
name={l:'Product created' for l in ['en','de','fr','es']}
req('/api/automation/flows/product_note',{'revision':0,'data':{'name':name,'active':True,'event':'product.created','condition':{'type':'alwaysValid'},'action':'note','instruction':name,'locale':'en-GB'}},merchant,'PUT')
mp=copy.deepcopy(draft);mp['catalog']['productNumber']='MCP-'+suffix;mp['commerce']['regulationPrice']=49.9;mp['commerce']['referencePrice']={'purchase_unit':0.5,'reference_unit':1.0,'unit_name':'l'}
mid=mcp('merchant.product.create',{'product':mp})['id']
for _ in range(60):
 jobs=req('/api/automation',h=merchant)['jobs']
 if any(j['state']=='completed' and j['result'].get('note')=='Product created' for j in jobs):break
 time.sleep(.2)
else:raise AssertionError(jobs)
assert req('/api/merchant/products/'+mid,h=merchant)['commerce']['referencePrice']['purchase_unit']==0.5
check('MCP creation and catalog queries use native handlers; committed product creation executes a durable flow')
# Hidden parents hide navigation children; nested product membership can be disabled.
cat=next(c for c in req('/api/merchant/categories',h=merchant)['elements'] if c['id']==parent)
cat['data']['displayNestedProducts']=False
req('/api/merchant/categories/'+parent,{'revision':cat['revision'],'parentId':cat['parentId'],'position':cat['position'],'data':cat['data']},merchant,'PUT')
assert pid not in [p['id'] for p in req('/store-api/product',{'categoryId':parent})['elements']]
cat['revision']+=1;cat['data']['visible']=False
req('/api/merchant/categories/'+parent,{'revision':cat['revision'],'parentId':cat['parentId'],'position':cat['position'],'data':cat['data']},merchant,'PUT')
assert not any(c['id'] in [parent,child] for c in req('/store-api/navigation',{})['elements'])
assert mid in [p['id'] for p in req('/store-api/product',{'categoryId':child})['elements']]
check('nested-product setting and ancestor visibility have distinct listing/navigation effects')
# Gallery images are tenant-scoped even when an img request cannot carry custom headers.
image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=')
boundary='catalog-'+suffix
parts=[]
for key,value in [('kind','attachment'),('title',json.dumps({l:'Synthetic image' for l in ['en','de','fr','es']}))]:
 parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"\r\n\r\n'+value+'\r\n').encode())
parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n').encode()+image+b'\r\n')
parts.append(('--'+boundary+'--\r\n').encode())
u=urllib.request.Request(BASE+'/api/merchant/products/'+mid+'/assets',data=b''.join(parts),headers={**merchant,'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
with urllib.request.urlopen(u) as response:asset=json.load(response)
req('/api/merchant/assets/'+asset['id'],{'digest':asset['digest'],'public':True},merchant,'PUT')
with urllib.request.urlopen(BASE+'/store-api/assets/'+asset['id']+'?shop='+w['workspace']) as response:assert response.read()==image
req('/store-api/assets/'+asset['id']+'?shop='+w2['workspace'],h={'x-tenant':w2['workspace']},expected=404)
check('uploaded gallery bytes survive tenant-scoped public delivery; foreign shop access fails')
# Publish a newly created staging category and product together; inventory remains live-owned.
cnew=req('/api/merchant/categories',{'revision':None,'parentId':'catalog-root','position':1,'data':{'active':True,'visible':True,'type':'page','translations':{l:{'name':'Staged '+l} for l in ['en','de','fr','es']}}},sh)['id']
staged=copy.deepcopy(draft);staged['catalog'].update({'productNumber':'NEW-STAGE-'+suffix,'categoryIds':[cnew],'salesChannelIds':[]})
sid=req('/api/merchant/products',staged,sh)['id']
changes=req('/api/environments/'+stage+'/diff',h=merchant)['changes'];selection=[{'key':c['key'],'digest':c['digest']} for c in changes if c['key'] in ['category:'+cnew,'product:'+sid]]
assert len(selection)==2,changes
req('/api/environments/'+stage+'/release',{'approve':True,'selections':selection},merchant)
published=req('/api/merchant/products/'+sid,h=merchant);assert published['catalog']['categoryIds']==[cnew] and published['commerce']['stock']==0 and published['catalog']['salesChannelIds']==[]
check('new category and new product publish together with assignments/visibility while stage stock stays private')
print(json.dumps({'checks':len(checks),'workspace':w['workspace'],'status':'passed'}))
