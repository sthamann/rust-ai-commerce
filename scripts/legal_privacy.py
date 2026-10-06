#!/usr/bin/env python3
"""Real tenant-scoped consent, checkout guards, declarations, MCP and flow consumers; no external providers."""
import copy, json, os, time, urllib.request, urllib.error, uuid
BASE=os.environ['BASE_URL']
def call(path,body=None,h=None,method=None,expected=200):
 req=urllib.request.Request(BASE+path, data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e);e.close()
 assert code==expected,(path,code,expected,v)
 return v
u=uuid.uuid4().hex[:10]
def shop(prefix):
 a=call('/api/auth/register',{'workspaceId':prefix+u,'workspaceName':'Legal fixture','name':'Owner','email':prefix+u+'@example.test','password':'Synthetic-legal-2026!'})
 return a,{'x-tenant':a['workspace'],'Authorization':'Bearer '+a['token']}
a,mh=shop('legal-');b,bh=shop('foreign-');sh={'x-tenant':a['workspace'],'x-commerce-locale':'de-DE'}
c=call('/store-api/checkout/cart',{'session':'legal-session-'+u},sh);h={**sh,'sw-context-token':c['token']}
p=call('/store-api/legal',h=h);assert 'operatorNotes' not in p['data']
signal={'eventId':uuid.uuid4().hex,'kind':'view','productId':'lamp'}
call('/store-api/personalization/events',signal,h,expected=403)
assert call('/api/experience',{'session':c['session'] if 'session' in c else 'legal-session-'+u},h)['adaptation']['localBehavior']==False
call('/store-api/privacy/consent',{'policyVersion':p['policyVersion'],'choices':{'personalization':True}},h,method='PUT')
for _ in range(3):signal['eventId']=uuid.uuid4().hex;result=call('/store-api/personalization/events',signal,h)
assert result['adapted'] and result['rankedProductIds'][0]=='lamp'
call('/store-api/privacy/consent',{'policyVersion':p['policyVersion'],'choices':{}},h,method='PUT')
call('/store-api/personalization/events',signal,h,expected=403)
call('/store-api/privacy/consent',h={**h,'x-tenant':b['workspace']},expected=404)
call('/store-api/privacy/consent',{'policyVersion':'old','choices':{}},h,method='PUT',expected=409)
call('/store-api/privacy/consent',{'policyVersion':p['policyVersion'],'choices':{'unknown':True}},h,method='PUT',expected=400)
print('PASS no API personalization without affirmative consent; revocation and foreign-shop denial',flush=True)
flow={'name':{'en':'Privacy received'},'active':True,'event':'consumer.withdrawal.requested','condition':{'type':'alwaysValid'},'action':'note','instruction':{'en':'Review declaration'},'locale':'en-GB'}
call('/api/automation/flows/legal_receipt',{'revision':0,'data':flow},mh,method='PUT')
v={'kind':'withdrawal','name':'Fixture','email':'buyer@example.test','reference':'Untrusted-reference','message':'Please withdraw','requestKey':uuid.uuid4().hex}
r=call('/store-api/legal/requests',v,h);again=call('/store-api/legal/requests',v,h);assert again['id']==r['id']
call('/store-api/legal/requests',{**v,'message':'Changed'},h,expected=409)
call('/store-api/legal/requests/'+r['id'],h={**h,'x-tenant':b['workspace']},expected=404)
second=call('/store-api/checkout/cart',{},sh);call('/store-api/legal/requests/'+r['id'],h={**h,'sw-context-token':second['token']},expected=404)
call('/api/merchant/legal/requests',h=sh,expected=401)
call('/api/merchant/legal/requests/'+r['id'],{'revision':1,'state':'in_review','note':'Private verification detail'},mh,method='PUT')
receipt=call('/store-api/legal/requests/'+r['id'],h=h);assert receipt['state']=='in_review' and 'reviewNote' not in receipt['data']
call('/api/merchant/legal/requests/'+r['id'],{'revision':1,'state':'completed','note':'stale'},mh,method='PUT',expected=409)
call('/api/merchant/legal/requests/'+r['id'],{'revision':2,'state':'completed','note':'foreign'},bh,method='PUT',expected=409)
assert len(call('/api/merchant/legal/requests',h=mh)['elements'])==1
replayed=call('/store-api/legal/requests',v,h);assert replayed['state']=='in_review' and 'reviewNote' not in replayed['data']
for _ in range(100):
 jobs=call('/api/automation',h=mh)['jobs'];matched=[j for j in jobs if j['flow']=='legal_receipt' and j['state']=='completed']
 if matched:break
 time.sleep(.1)
assert matched,jobs
assert 'buyer@example.test' not in json.dumps(matched) and 'Please withdraw' not in json.dumps(matched)
m=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},h)['result']['tools'];assert 'privacy.policy' in [x['name'] for x in m] and 'merchant.legal.review' not in [x['name'] for x in m]
m=call('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'privacy.policy','arguments':{}}},h);assert m['result']['structuredContent']['policyVersion']==p['policyVersion']
print('PASS idempotent public declaration, private review, permissions, MCP and actual outbox flow',flush=True)
settings=call('/api/merchant/commerce',h=mh);settings['data']['legal']['strictCheckout']=True
for key in ('privacy','terms','shipping','withdrawal'):settings['data']['legal']['documents'][key]={'en-GB':'Reviewed fixture '+key}
call('/api/merchant/commerce',settings,mh,method='PUT');settings=call('/api/merchant/commerce',h=mh);p2=call('/store-api/legal',h=h);assert p2['policyVersion']!=p['policyVersion']
assert not call('/store-api/privacy/consent',h=h)['decided']
product=call('/api/merchant/products/mug',h=mh);product['extra']['compliance']={key:{'en-GB':'Fixture '+key} for key in ('manufacturer','manufacturerAddress','manufacturerContact','identifier')}
call('/api/merchant/products/mug',product,mh,method='PUT')
c=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'mug','quantity':1}]},h)
oh={**h,'Idempotency-Key':uuid.uuid4().hex}
call('/store-api/checkout/order',{},oh,expected=400)
call('/store-api/legal/acceptance',{'policyVersion':p['policyVersion'],'terms':True,'digitalImmediate':False},h,method='PUT',expected=409)
call('/store-api/legal/acceptance',{'policyVersion':p2['policyVersion'],'terms':True,'digitalImmediate':False},h,method='PUT')
o=call('/store-api/checkout/order',{},oh);assert o['legal']['policyVersion']==p2['policyVersion'] and o['legal']['documents']['terms']['en-GB']=='Reviewed fixture terms'
# A policy edit never rewrites an accepted order.
settings['data']['legal']['documents']['terms']['en-GB']='New terms'
call('/api/merchant/commerce',settings,mh,method='PUT')
assert call('/api/merchant/orders/'+o['id'],h=mh)['legal']['documents']['terms']['en-GB']=='Reviewed fixture terms'
print('PASS strict server checkout rejects missing/stale acknowledgement; immutable inherited document snapshot',flush=True)

# Digital consumer delivery needs a separate affirmative immediate-supply acknowledgement.
product=call('/api/merchant/products/lamp',h=mh);product['extra']['digital']=True;product['extra']['compliance']={'compatibility':{'en-GB':'PDF reader, fixture'}}
call('/api/merchant/products/lamp',product,mh,method='PUT')
boundary='legal-'+uuid.uuid4().hex
raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n'+json.dumps({'en':'Synthetic guide'})+f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\ndownload\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="guide.txt"\r\nContent-Type: text/plain\r\n\r\nSynthetic guide\r\n--{boundary}--\r\n').encode()
req=urllib.request.Request(BASE+'/api/merchant/products/lamp/assets',data=raw,headers={**mh,'Content-Type':'multipart/form-data; boundary='+boundary})
with urllib.request.urlopen(req) as response:asset=json.load(response)
call('/api/merchant/assets/'+asset['id'],{'public':True,'digest':asset['digest']},mh,method='PUT')
d=call('/store-api/checkout/cart',{},sh);dh={**sh,'sw-context-token':d['token'],'Idempotency-Key':uuid.uuid4().hex}
call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'lamp','quantity':1}]},dh)
p3=call('/store-api/legal',h=dh)
call('/store-api/legal/acceptance',{'policyVersion':p3['policyVersion'],'terms':True,'digitalImmediate':False},dh,method='PUT')
assert call('/store-api/checkout/order',{},dh,expected=400)['errors'][0]['detail']=='Current legal acknowledgement required'
call('/store-api/legal/acceptance',{'policyVersion':p3['policyVersion'],'terms':True,'digitalImmediate':True},dh,method='PUT')
digital=call('/store-api/checkout/order',{},dh);assert digital['legal']['acceptance']['digitalImmediate']==True
print('PASS real digital checkout rejects missing immediate-supply acknowledgement and records explicit approval',flush=True)
