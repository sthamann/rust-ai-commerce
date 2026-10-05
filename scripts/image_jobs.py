#!/usr/bin/env python3
"""Real image jobs/bytes against a local Images fixture: private review, stale/tenant guards, edit multipart and no paid calls."""
import base64,json,os,socket,threading,time,urllib.request,urllib.error,uuid,struct,zlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from testing.runtime import ROOT,serve,stop

def chunk(kind,body):return struct.pack('>I',len(body))+kind+body+struct.pack('>I',zlib.crc32(kind+body)&0xffffffff)
PNG=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\x00\x7f\xff'*2)*2))+chunk(b'IEND',b'')
state={'reject':False,'invalid':False};calls=[]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  body=self.rfile.read(int(self.headers['Content-Length']));calls.append((self.path,self.headers['Content-Type'],body))
  if state['reject']:self.send_response(429);self.end_headers();return
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'data':[{'b64_json':base64.b64encode(b'invalid'if state['invalid']else PNG).decode()}]}).encode())
provider=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=provider.serve_forever,daemon=True).start()
with socket.socket()as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
BASE=f'http://127.0.0.1:{port}';env={**os.environ,'BIND_ADDR':f'127.0.0.1:{port}','OPENAI_BASE_URL':f'http://127.0.0.1:{provider.server_address[1]}/v1','OPENAI_API_KEY':'synthetic-image-fixture','OPENAI_IMAGE_MODEL':'fixture-image','IMAGE_GENERATION_ENABLED':'true','PROCESS_ROLE':'all'}
log=(ROOT/'.run/image-contract.log').open('w');server=serve(env,BASE,log);public={};merchant={}
def req(path,body=None,h=None,method=None,expected=200):
 r=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**public,**(h or {})},method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(r,timeout=30)as response:status=response.status;raw=response.read();data=json.loads(raw)if raw.startswith(b'{')else raw
 except urllib.error.HTTPError as e:status=e.code;data=json.load(e)
 assert status==expected,(path,status,expected,data)
 return data
def wait(job,terminal='ready'):
 for _ in range(100):
  value=req('/api/merchant/media/jobs/'+job['id'],h=merchant)
  if value['state']==terminal:return value
  if value['state']=='failed'and terminal!='failed':raise AssertionError(value)
  time.sleep(.1)
 raise AssertionError(value)
def create(mode='generate',source=None):
 pd=req('/api/merchant/products/mug',h=merchant)
 return req('/api/merchant/products/mug/media/jobs',{'revision':pd['revision'],'mode':mode,'sourceId':source,'prompt':'Synthetic fixture lighting'},merchant)
try:
 suffix=uuid.uuid4().hex[:10];w=req('/api/auth/register',{'workspaceId':'images-'+suffix,'workspaceName':'Image fixture','name':'Fixture owner','email':'images-'+suffix+'@example.test','password':'Synthetic-images-2026!'})
 public={'x-tenant':w['workspace']};merchant={**public,'Authorization':'Bearer '+w['token']}
 assert req('/api/merchant/media/provider',h=merchant)=={'configured':True,'model':'fixture-image'}
 tools=req('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/list'},merchant)['result']['tools'];create_tool=next(t for t in tools if t['name']=='merchant.media.create');assert create_tool['inputSchema']['required']==['productId','revision','mode','prompt']
 inv=req('/api/workspace/invitations',{'email':'image-viewer-'+suffix+'@example.test','role':'viewer'},merchant)
 viewer=req('/api/auth/accept',{'invitationToken':inv['token'],'name':'Viewer fixture','password':'Synthetic-images-2026!'})
 vh={**public,'Authorization':'Bearer '+viewer['token']}
 visible=req('/mcp',{'jsonrpc':'2.0','id':3,'method':'tools/list'},vh)['result']['tools'];assert not any(t['name']in ['merchant.media.create','merchant.media.apply']for t in visible)
 req('/api/merchant/products/mug/media/jobs',{'revision':1,'mode':'generate','prompt':'Forbidden fixture'},vh,expected=403);assert not calls
 pd=req('/api/merchant/products/mug',h=merchant)
 req('/api/merchant/products/mug/media/jobs',{'revision':0,'mode':'generate','prompt':'Fixture'},merchant,expected=409)
 req('/api/merchant/products/mug/media/jobs',{'revision':pd['revision'],'mode':'optimize','sourceId':'not-owned','prompt':'Fixture'},merchant,expected=400);assert not calls
 draft=wait(create());assert draft['preview'].startswith('data:image/png;base64,');req('/store-api/assets/'+draft['assetId']+'?shop='+w['workspace'],expected=404)
 pd['translations']['en']['description']='Fixture revision change';req('/api/merchant/products/mug',pd,merchant,'PUT');req('/api/merchant/media/jobs/'+draft['id']+'/apply',{'revision':pd['revision']+1},merchant,expected=409)
 draft=wait(create());pd=req('/api/merchant/products/mug',h=merchant);image=req('/api/merchant/media/jobs/'+draft['id']+'/apply',{'revision':pd['revision']},merchant);published=req(image['url']);assert published.startswith(b'\x89PNG')
 pd['commerce']['media'].append(image);req('/api/merchant/products/mug',pd,merchant,'PUT');assert req('/store-api/product/mug')['product']['media'][-1]['id']==image['id']
 edited=wait(create('optimize',image['id']));assert calls[-1][0]=='/v1/images/edits'and 'multipart/form-data'in calls[-1][1]and published in calls[-1][2]
 assert calls[0][0]=='/v1/images/generations'and json.loads(calls[0][2])['model']=='fixture-image'
 other=req('/api/auth/register',{'workspaceId':'images-other-'+suffix,'workspaceName':'Other','name':'Fixture other','email':'images-other-'+suffix+'@example.test','password':'Synthetic-images-2026!'})
 req('/api/merchant/media/jobs/'+edited['id'],h={**merchant,'x-tenant':other['workspace']},expected=403)
 req('/api/merchant/media/jobs/'+edited['id'],h={'x-tenant':other['workspace'],'Authorization':'Bearer '+other['token']},expected=404)
 state['invalid']=True;failed=wait(create(), 'failed');assert 'Invalid'in failed['error'];state['invalid']=False;state['reject']=True;failed=wait(create(),'failed');assert '429'in failed['error'];count=len(calls);time.sleep(1.1);assert len(calls)==count
 m=req('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'merchant.media.detail','arguments':{'id':edited['id']}}},merchant);assert not m['result']['isError']and m['result']['structuredContent']['state']=='ready'
 stop(server);server=serve(env,BASE,log);assert req('/api/merchant/media/jobs/'+edited['id'],h=merchant)['state']=='ready';assert any(j['id']==edited['id']for j in req('/api/merchant/products/mug/media/jobs',h=merchant)['jobs']);assert len(calls)==count
 print('PASS local Images generation/edit protocols, private previews, real gallery bytes, stale apply, tenant/MCP boundaries, invalid/failed providers and cold restart without retry')
finally:stop(server);provider.shutdown();log.close()
