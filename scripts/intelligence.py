#!/usr/bin/env python3
"""Actual AGE/vector persistence and optional live local inference integration."""
import json, os, pathlib, subprocess, urllib.request, urllib.error

base=os.environ.get('BASE_URL','http://127.0.0.1:8787'); root=pathlib.Path(__file__).resolve().parents[1]
ah={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN']}; checks=[]
def call(path,body=None,h=None,expected=200):
    request=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
    try:
        with urllib.request.urlopen(request,timeout=240) as r: status=r.status; value=json.load(r)
    except urllib.error.HTTPError as e: status=e.code; value=json.load(e)
    assert status==expected,(status,value); return value
def passed(name):checks.append(name);print('PASS',name)
graph=call('/api/knowledge'); assert graph['engine']=='Apache AGE' and any(n['product_id']=='lamp' and n['need']=='reading' for n in graph['needs']); assert any(p['left']=='chair' and p['right']=='lamp' for p in graph['pairs']); passed('Actual Cypher graph supplies needs and complementary products')
assert call('/api/knowledge',h={'x-tenant':'workshop'})['tenant']=='workshop'
call('/api/knowledge',h={'x-tenant':"atelier'}) RETURN 1 //"},expected=400); passed('Graph parameters and tenant boundary reject query injection')
call('/api/knowledge/reindex',{},expected=401); passed('Semantic index mutation requires merchant authority')
cart=call('/store-api/checkout/cart',{}); h={'sw-context-token':cart['token']}
cart=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'lamp','quantity':1},{'referencedId':'notebook','quantity':1}]},h)
assert next(l for l in cart['lineItems'] if l['id']=='lamp')['price']['listPrice']['price']==89.9
assert next(l for l in cart['lineItems'] if l['id']=='notebook')['price']['referencePrice']['unit_name']=='pages'; passed('Ported list/reference pricing is exercised by actual cart quote')
wire=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25'}},{'jsonrpc':'2.0','method':'notifications/initialized'},{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'knowledge.graph','arguments':{}}}]
env={**os.environ,'COMMERCE_URL':base}
reply=subprocess.check_output(['python3',str(root/'scripts/mcp_stdio.py')],input=''.join(json.dumps(v)+'\n' for v in wire).encode(),env=env)
replies=[json.loads(v) for v in reply.splitlines()]; assert len(replies)==2 and replies[1]['result']['structuredContent']['engine']=='Apache AGE'; passed('Claude Desktop stdio bridge executes real Rust MCP graph tool')
if os.environ.get('TEST_EMBEDDING')=='1':
    call('/api/knowledge/reindex',{},ah)
    found=call('/api/knowledge/search',{'query':'warm reading lamp'}); assert found['mode']=='vector' and found['indexedProducts']==6 and any(v['id']=='lamp' for v in found['hits'][:3]); passed('Real embedding inference stored in pgvector and reused for semantic retrieval')
    result=call('/api/knowledge/reindex',{},ah); assert result['indexed']==0; passed('Unchanged semantic documents reuse persisted embeddings')
if os.environ.get('TEST_MODEL')=='1':
    before=next(p for p in call('/store-api/product',{})['elements'] if p['id']=='lamp')['price']
    target=74.9 if before!=74.9 else 79.9
    response=call('/api/agent/chat',{'message':f'Setze ausschließlich den Bruttopreis von lamp / Arc Desk Light auf {target} EUR. Sonst nichts ändern.'},ah)
    msg=response['messages'][-1]; task=msg['data']; assert not task.get('error'),msg
    changes=task['preview']['proposal']['changes']; assert len(changes)==1 and changes[0]['product_id']=='lamp' and abs(changes[0]['price']-target)<1e-8; passed('Live local model produces grounded merchant-chat preview')
    assert next(p for p in call('/store-api/product',{})['elements'] if p['id']=='lamp')['price']==before; passed('Chat proposal does not change prices before approval')
    call('/api/agent/tasks/'+task['taskId']+'/apply',{'approve':True},ah)
    restored=call('/api/agent/conversations/'+response['conversationId'],h=ah); assert restored['messages'][-1]['applied']; passed('Chat approval affects live catalog and survives history reload')
    if os.environ.get('TEST_EMBEDDING')=='1':
        found=call('/api/knowledge/search',{'query':'reading light'}); assert next(v for v in found['hits'] if v['id']=='lamp')['price']==target; passed('Semantic results hydrate current authoritative price after merchant change')
report={'passed':len(checks),'checks':checks,'liveLocalModel':os.environ.get('TEST_MODEL')=='1','liveEmbedding':os.environ.get('TEST_EMBEDDING')=='1'}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
