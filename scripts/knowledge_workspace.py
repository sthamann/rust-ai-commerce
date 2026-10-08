#!/usr/bin/env python3
"""Actual tenant-scoped knowledge lifecycle, multilingual retrieval, cursor census and selective staging; no model calls."""
import json, os, urllib.request, urllib.error, uuid, time
base=os.getenv('BASE_URL','http://127.0.0.1:8787')
def call(path,body=None,session=None,tenant=None,expected=200,method=None,locale='en-GB',raw=None,contenttype='application/json'):
 h={'Content-Type':contenttype,'x-commerce-locale':locale}
 if session:h.update({'Authorization':'Bearer '+session['token'],'x-tenant':tenant or session['workspace']})
 elif tenant:h['x-tenant']=tenant
 r=urllib.request.Request(base+path,data=raw if raw is not None else None if body is None else json.dumps(body).encode(),headers=h,method=method)
 try:
  with urllib.request.urlopen(r,timeout=30) as out:code=out.status;v=json.load(out)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==expected,(path,code,expected,v)
 return v
def account():
 suffix=uuid.uuid4().hex[:12]
 return call('/api/auth/register',{'workspaceId':'know-'+suffix,'workspaceName':'Knowledge fixture','name':'Owner','email':suffix+'@example.test','password':'Synthetic-knowledge-2026!'})
a=account();other=account();tenant=a['workspace']
call('/api/knowledge/workspace',expected=401)
call('/api/knowledge/workspace',session=a,tenant=other['workspace'],expected=403)
w=call('/api/knowledge/workspace',session=a);assert w['totals']['products']>=6 and w['totals']['sources']==0 and w['canWrite']
v={'title':'Care facts','content':'Dishwasher safe ceramic. Capacity 500 ml.','productId':'mug','kind':'care','translations':{'de-DE':{'title':'Pflegehinweise','content':'Spülmaschinenfeste Keramik. Inhalt 500 ml.'},'es-ES':{'title':'Cuidados','content':'Cerámica apta para lavavajillas.'}}}
doc=call('/api/knowledge/documents',v,a);id=doc['id'];path='/api/knowledge/documents/'+id
assert doc['chunks']==3 and doc['visibility']=='private'
assert call(path,session=a)['translations']['de-DE']['title']=='Pflegehinweise'
call(path,session=other,expected=404)
call('/api/knowledge/documents',{**v,'productId':'foreign'},a,expected=400)
call('/api/knowledge/documents',{**v,'translations':{'xx-XX':{'title':'bad'}}},a,expected=400)
call('/api/knowledge/documents',{**v,'translations':{'de-DE':{'unexpected':'bad'}}},a,expected=400)
call('/api/knowledge/documents',{**v,'visibility':'public'},a,expected=400)
p=lambda audience='customer',query='Dishwasher',locale='en-GB',product='mug':call('/api/knowledge/preview',{'query':query,'audience':audience,'productId':product},a,locale=locale)
assert not p()['sources'] and p('merchant')['sources'] and not p()['modelCalled'] and not p()['sideEffects']
call('/api/knowledge/preview',{'query':'x','audience':'customer'},a,expected=400)
call('/api/knowledge/preview',{'query':'x','audience':'customer','productId':'foreign'},a,expected=404)
call(path,{'visibility':'public','revision':1,'approve':False},a,expected=400,method='PUT')
call(path,{'visibility':'public','revision':1,'approve':True},a,method='PUT')
# Source quotation is evidence, not semantic truth: propose -> review -> exact claim compiler.
claim={'productId':'mug','sourceId':id,'contentHash':doc['contentHash'],'locale':'en-GB','text':'Capacity 500 ml.','quote':'Capacity 500 ml.','nodeType':'property'}
call('/api/intelligence/claim.propose',{**claim,'quote':'Invented waterproof certification'},a,expected=400)
call('/api/intelligence/claim.propose',claim,other,expected=404)
c=call('/api/intelligence/claim.propose',claim,a)
assert not call('/store-api/product/mug/facts',tenant=tenant)['claims']
review={'id':c['id'],'revision':1,'state':'confirmed','approve':True}
call('/api/intelligence/claim.review',{**review,'revision':100},a,expected=409)
call('/api/intelligence/claim.review',review,other,expected=404)
call('/api/intelligence/claim.review',review,a)
facts=call('/store-api/product/mug/facts',tenant=tenant)['claims'];assert facts[0]['state']=='confirmed' and facts[0]['sourceCurrent'] and facts[0]['data']['nodeType']=='property'
compiled={'productId':'mug','claims':[{'id':c['id'],'text':claim['text']}]}
assert call('/api/intelligence/compile',compiled,a)['compiled']
call('/api/intelligence/compile',{**compiled,'claims':[{'id':c['id'],'text':'Unproven certification'}]},a,expected=409)
call('/api/intelligence/compile',compiled,other,expected=409)
batch={'products':[{'productId':'mug','claims':compiled['claims']}]}
assert call('/store-api/intelligence/claims',{'productIds':['mug','lamp']},tenant=tenant)['products'][1]['statements']==[]
assert call('/store-api/intelligence/claims/compile',batch,tenant=tenant)['compiled']
call('/store-api/intelligence/claims/compile',batch,tenant='workshop',expected=409)
call('/store-api/intelligence/claims',{'productIds':['foreign']},tenant=tenant,expected=404)
call('/store-api/intelligence/claims',{'productIds':['mug']*25},tenant=tenant,expected=400)
call('/store-api/intelligence/claims/compile',{'products':[{'productId':'mug','claims':[{'id':c['id'],'text':'Unproven certification'}]}]},tenant=tenant,expected=409)
print('PASS typed claim lifecycle, exact quotations, foreign-source denial and confirmed claim compiler')
assert p()['sources'][0]['contentHash']==doc['contentHash']
assert p(query='Spülmaschinenfeste',locale='de-DE')['sources'][0]['title']=='Pflegehinweise'
assert not p(query='Dishwasher',locale='de-DE')['sources'], 'Translated source must not mix languages'
assert p(query='Dishwasher',locale='fr-FR')['sources'], 'Missing translation inherits source/main language'
assert not p(product='lamp')['sources']
print('PASS private/public boundary, exact hash, language-specific content, fallback and product ownership')
updated={**v,'locale':'en-GB','revision':2,'title':'Revised care','productId':'lamp','content':'Dishwasher prohibited. Read instructions.'}
call(path,updated,a,method='PATCH')
assert not call('/store-api/product/mug/facts',tenant=tenant)['claims']
call('/api/intelligence/compile',compiled,a,expected=409)
call('/api/intelligence/claim.review',{**review,'revision':2},a,expected=409)
call('/store-api/intelligence/claims/compile',batch,tenant=tenant,expected=409)
print('PASS changed source withdraws approved claims from public rendering immediately')

assert not p()['sources'] and not p(product='lamp')['sources']
call(path,updated,a,method='PATCH',expected=409)
call(path,{'visibility':'public','revision':2,'approve':True},a,method='PUT',expected=409)
call(path,{'visibility':'public','revision':3,'approve':True},a,method='PUT')
graph=call('/api/knowledge',session=a)
assert any(d['document_id']==id and d['product_id']=='lamp' for d in graph['documents'])
assert not any(d['document_id']==id and d['product_id']=='mug' for d in graph['documents']), 'Stale graph edge survived reassignment'
assert p(product='lamp')['sources'] and not p()['sources']
call(path+'/lifecycle',{'archived':True,'revision':4,'approve':True},a)
assert not p(product='lamp')['sources']
call(path,{'visibility':'public','revision':5,'approve':True},a,method='PUT',expected=409)
assert id not in [d['document_id'] for d in call('/api/knowledge',session=a)['documents']]
call(path+'/lifecycle',{'archived':False,'revision':5,'approve':True},a)
assert call(path,session=a)['visibility']=='private' and not p(product='lamp')['sources']
call(path,{'visibility':'public','revision':6,'approve':True},a,method='PUT')
print('PASS revision races, edit re-review, graph reassignment, archive exclusion and private restore')
# German shop main language, English source; requested French inherits the German field, explicit empty Spanish stays empty.
settings=call('/api/merchant/commerce',session=a);settings['data']['mainLocale']='de-DE';call('/api/merchant/commerce',settings,a,method='PUT')
data=call(path,session=a)
call(path,{**updated,'revision':data['revision'],'translations':{'de-DE':{'content':'Garantierte Handwäsche.'},'es-ES':{'content':''}}},a,method='PATCH')
assert p('merchant','Handwäsche','fr-FR','lamp')['sources']
assert not p('merchant','Handwäsche','es-ES','lamp')['sources']
# Shop-wide rules/FAQs also feed customer questions after explicit review.
policy=call('/api/knowledge/documents',{'title':'Rückgabe','content':'Rückgabe innerhalb der dokumentierten Frist.','kind':'returns'},a)
assert call('/api/knowledge/documents/'+policy['id'],session=a)['locale']=='de-DE'
call('/api/knowledge/documents/'+policy['id'],{'revision':1,'visibility':'public','approve':True},a,method='PUT')
assert p(query='Rückgabe',locale='de-DE')['sources']
print('PASS non-English main-language inheritance, explicit empty content and shop-wide policy scope')
# All counts span >1 page. Kind/search filters are applied before cursor pagination.
for i in range(52):call('/api/knowledge/documents',{'title':f'FAQ {i:02}','content':f'Unique fixture answer {i:02}.','kind':'faq'},a)
w=call('/api/knowledge/workspace',session=a);assert w['totals']['sources']==54 and len(w['sources'])==50 and w['next']
page=call('/api/knowledge/workspace?after='+w['next'],session=a);assert len(page['sources'])==4 and page['next'] is None
assert not ({s['id'] for s in w['sources']}&{s['id'] for s in page['sources']})
w=call('/api/knowledge/workspace?kind=returns',session=a);assert len(w['sources'])==1 and w['sources'][0]['id']==policy['id']
assert call('/api/knowledge/workspace?query=FAQ%2051',session=a)['sources'][0]['title']=='FAQ 51'
assert any(e['kind']=='knowledge.document.updated' for e in call('/api/knowledge/workspace',session=a)['activity']) is False, 'Only newest 20 activity events should appear'
print('PASS whole-shop totals, cursor traversal, server-side kind/search filters and bounded activity')
# Real multipart parser preserves translated metadata, never publishes implicitly.
boundary='knowledge-fixture';fields={'title':'Uploaded care','kind':'manual','locale':'en-GB','translations':json.dumps({'de-DE':{'title':'Hochgeladene Anleitung','content':'Griff vorsichtig anfassen.'}})}
raw=b''
for key,value in fields.items():raw+=f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
raw+=f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="care.txt"\r\nContent-Type: text/plain\r\n\r\nHandle carefully.\r\n--{boundary}--\r\n'.encode()
u=call('/api/knowledge/documents/upload',session=a,raw=raw,contenttype='multipart/form-data; boundary='+boundary)
assert call('/api/knowledge/documents/'+u['id'],session=a)['translations']['de-DE']['title']=='Hochgeladene Anleitung'
# Existing source metadata and translation chunks survive clone and selective release.
stage=call('/api/environments',{'name':'Knowledge changes'},a)['id']
assert call(path,session=a,tenant=stage)['translations']==call(path,session=a)['translations']
s=call(path,session=a,tenant=stage)
change={**updated,'revision':s['revision'],'title':'Staged care','kind':'warranty','translations':{'es-ES':{'title':'Garantía','content':'Garantía de prueba.'}}}
call(path,change,a,stage,method='PATCH')
diff=call('/api/environments/'+stage+'/diff',session=a)['changes'];source=next(d for d in diff if d['key']=='document:'+id)
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':source['key'],'digest':source['digest']}]},a)
s=call(path,session=a);assert s['kind']=='warranty' and s['translations']['es-ES']['title']=='Garantía' and s['visibility']=='private'
print('PASS multilingual upload, real clone and selective metadata/chunk publication')
# Shared MCP operation / tenant role guards.
tools=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'},a)['result']['tools']
assert any(t['name']=='knowledge.preview' for t in tools) and any(t['name']=='knowledge.product' for t in tools)
m=call('/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'knowledge.preview','arguments':{'query':'Garantie','audience':'merchant','productId':'lamp'}}},a)['result'];assert not m['isError'] and not m['structuredContent']['modelCalled']
inv=call('/api/workspace/invitations',{'email':uuid.uuid4().hex+'@example.test','role':'viewer'},a)
viewer=call('/api/auth/accept',{'invitationToken':inv['token'],'name':'Viewer','password':'Synthetic-knowledge-2026!'})
assert not call('/api/knowledge/workspace',session=viewer)['canWrite']
call(path,change,viewer,method='PATCH',expected=403)
readtools=call('/mcp',{'jsonrpc':'2.0','id':3,'method':'tools/list'},viewer)['result']['tools']
assert any(t['name']=='knowledge.workspace' for t in readtools) and not any(t['name']=='knowledge.source.edit' for t in readtools)
call('/api/knowledge/product/mug',session=other)
assert not call('/api/knowledge/product/mug',session=other)['sources']
assert call('/api/knowledge/product/mug',session=a)['stats']['variants']>=1
call('/api/workspace/members/'+viewer['user']['id'],{'role':'viewer','active':True,'permissions':['catalog.write']},a,method='PUT')
call('/api/knowledge/workspace',session=viewer,expected=403)
call('/api/agent/plan',{'instruction':'Read private knowledge'},viewer,expected=403)
call('/api/agent/chat',{'message':'Read private knowledge'},viewer,expected=403)
print('PASS HTTP/MCP parity, read-only viewer controls and cross-shop source isolation; paid provider calls: 0')

# Knowledge lifecycle events are selectable and actually reach the durable rule/flow consumer without an order.
events=['knowledge.document.ingested','knowledge.document.updated','knowledge.document.visibility','knowledge.document.archived','knowledge.document.restored','intelligence.decision']
assert set(events)<=set(call('/api/automation/catalog',session=a)['events'])
names={l:'Knowledge event fixture' for l in ['en','de','fr','es']}
flow={'name':names,'active':True,'event':events[0],'condition':{'type':'eventField','path':'productId','operator':'=','value':'notebook'},'action':'note','instruction':names,'locale':'en-GB'}
call('/api/automation/flows/source_added',{'data':flow,'revision':0},a,method='PUT')
source=call('/api/knowledge/documents',{'title':'Flow care fixture','content':'Only this source triggers the knowledge fixture.','productId':'notebook'},a)
for _ in range(100):
 jobs=call('/api/automation',session=a)['jobs'];found=[j for j in jobs if j['flow']=='source_added' and j['state']=='completed']
 if found:break
 time.sleep(.1)
assert found, jobs
assert found[0]['result']['note']==names['en']
assert found[0]['result']['orderId']==''
assert not any(j['flow']=='source_added' for j in call('/api/automation',session=other)['jobs'])
print('PASS real source event -> rule -> durable completed flow without order; cross-shop exclusion and provider calls: 0')
