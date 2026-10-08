#!/usr/bin/env python3
"""Actual native scoped file upload, callback read, product/digest/key fences and public-file policy."""
import copy,json,os,pathlib,urllib.request,urllib.error,uuid,base64
from testing.app_approval import consent
base=os.environ['BASE_URL'];t='assets-'+uuid.uuid4().hex[:10]
def call(path,body=None,h=None,status=200):
 if path=='/api/apps' and body is not None:body=consent(body)
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
 return response(req,status)
def response(req,status):
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(req.full_url,code,status,v);return v
def upload(path,h,product='mug',grant=None,data=b'export fixture\n'*6000,mime='text/plain',status=200):
 boundary=uuid.uuid4().hex;fields={'productId':product,'kind':'attachment','title':json.dumps({'en':'App upload'})}
 if grant is not None:fields['grant']=grant
 parts=[f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k,v in fields.items()]
 parts+=[f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.txt"\r\nContent-Type: {mime}\r\n\r\n'.encode()+data+b'\r\n',f'--{boundary}--\r\n'.encode()]
 return response(urllib.request.Request(base+path,data=b''.join(parts),headers={**h,'Content-Type':'multipart/form-data; boundary='+boundary}),status)
u=call('/api/auth/register',{'workspaceId':t,'name':'Asset owner','email':t+'@example.test','password':'Synthetic-assets-password!'});h={'x-tenant':t,'Authorization':'Bearer '+u['token']}
m=json.loads((pathlib.Path(__file__).resolve().parents[1]/'extensions/apps/care-studio/manifest.json').read_text());m['id']='assets_fixture';m['permissions']+=['assets.read','assets.write'];e=m['entities'][0];e['fields']+=[{'name':'file','label':m['name'],'kind':'file'}]
for name,handler,read,scope,properties in [('assets','assets',True,'catalog.read',{'productId':{'type':'string'}}),('preview_asset','asset_preview',True,'catalog.read',{'id':{'type':'string'},'productId':{'type':'string'}}),('upload_asset','asset_upload',False,'catalog.write',{'productId':{'type':'string'}})]:
 m['actions'].append({'name':name,'description':'Fixture files','handler':handler,'readOnly':read,'public':False,'permission':scope,'mcp':False,'inputSchema':{'type':'object','properties':properties,'additionalProperties':False}})
m['surfaces'][0].update(location='admin.product.tab',actions=m['surfaces'][0]['actions']+['assets','preview_asset','upload_asset'])
call('/api/apps',{'manifest':m},h);p='/api/apps/'+m['id'];s=p+'/surfaces/workspace';grant=call(s+'/grant',{'context':{'productId':'mug'}},h)['token']
a=upload(s+'/assets',h,grant=grant);assert not a['public'];items=call(s+'/actions/assets',{'grant':grant,'input':{'productId':'mug'}},h);assert items['elements'][0]['id']==a['id'] and items['elements'][0]['bytes']>65536
upload(s+'/assets',h,product='chair',grant=grant,status=403)
digest=next(p for p in call('/api/apps',h=h)['packages'] if p['id']==m['id'])['digest'];k=call(p+'/credentials',{'digest':digest,'approve':True,'permissions':['assets.read','assets.write'],'expiresInDays':1},h);kh={**h,'Authorization':'Bearer '+k['key']}
binary=call(p+'/core/asset',{'id':a['id'],'productId':'mug'},kh);assert base64.b64decode(binary['base64'])==b'export fixture\n'*6000
call(p+'/core/asset',{'id':a['id'],'productId':'chair'},kh,403);call('/api/apps/another/core/asset',{'id':a['id']},kh,403)
image=upload(p+'/core/asset_upload',kh,data=b'\x89PNG\r\n\x1a\nfixture',mime='image/png');preview=call(p+'/core/asset_preview',{'id':image['id']},kh);assert preview['mime']=='image/png'
call(p+'/actions/save_guides',{'id':'private','revision':0,'fields':{'title':{'en':'Unsafe public link'},'file':a['id']}},h,400)
new=copy.deepcopy(m);new['version']='1.0.1';call('/api/apps',{'manifest':new},h);upload(s+'/assets',h,grant=grant,status=403);call(p+'/core/asset',{'id':a['id']},kh,401)
other=t+'-other';u2=call('/api/auth/register',{'workspaceId':other,'name':'Other asset owner','email':other+'@example.test','password':'Synthetic-assets-password!'});oh={'x-tenant':other,'Authorization':'Bearer '+u2['token']};call('/api/apps',{'manifest':m},oh);call(p+'/core/asset',{'id':a['id']},oh,404);assert not call(p+'/core/assets',{},oh)['elements']
print('PASS real >64 KiB product asset upload/export reads, native grant context, private image preview, public-field rejection, package/key fences and foreign tenant isolation')
