#!/usr/bin/env python3
"""Actual Studio API, localization and original-kernel consumer checks."""
import json,os,urllib.request,urllib.error,pathlib,uuid,http.client,socket
base=os.environ.get('BASE_URL','http://127.0.0.1:8787');auth={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN']};checks=[]
def call(path,body=None,headers=None,expected=200):
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})})
 try:
  with urllib.request.urlopen(req,timeout=240) as r: status=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:status=e.code;v=json.load(e)
 assert status==expected,(path,status,v);return v
def ok(name): checks.append(name);print('PASS',name)
call('/api/merchant/overview',expected=401);call('/api/merchant/quote',{'productId':'mug','quantity':1},expected=401);ok('Studio overview and quote require merchant authorization')
for locale,needle in [('de-DE','Schreibtischleuchte'),('fr-FR','Lampe'),('es-ES','Lámpara'),('en-GB','Desk Light')]:
 h={**auth,'x-commerce-locale':locale};v=call('/api/merchant/overview',headers=h)
 assert v['locale']==locale and needle in next(p['name'] for p in v['products'] if p['id']=='lamp')
 assert min(100,v['summary']['orders'])==len(call('/api/search/order',{},auth)['data']) # demo <100
 assert len(v['learning']['timeline'])==7 and len(v['timeline'])==7 and v['knowledge']['graph']['engine']=='Apache AGE'
 assert not v['knowledge']['modelWeightsLearn'] and not v['connections']['chatgptAccountLinked']
ok('Four localized overview responses use actual orders, graph and explicit connection boundaries')
de=call('/store-api/product',{}, {'x-commerce-locale':'de-DE'})
ch=call('/store-api/product',{}, {'x-commerce-locale':'de-CH'})
assert de['elements']==ch['elements'] and len(ch['languageIdChain'])==3
assert call('/store-api/context',headers={'sw-language-id':'1'*32})['locale']=='de-DE'
call('/store-api/product',{}, {'x-commerce-locale':'unknown'},400);ok('Swiss German falls back through original parent chain; header selection and unavailable locale')
# Send headers and the body separately, the case that exposed truncated large responses.
endpoint=urllib.parse.urlsplit(base);conn=http.client.HTTPConnection(endpoint.hostname,endpoint.port,timeout=30)
conn.putrequest('POST','/store-api/product');conn.putheader('Content-Type','application/json');conn.putheader('Content-Length','2');conn.endheaders()
conn.sock.settimeout(.2)
try:
 early=conn.sock.recv(1)
 raise AssertionError('Catalog replied before consuming its POST body: '+repr(early))
except socket.timeout:pass
conn.sock.settimeout(30);conn.send(b'{}');response=conn.getresponse()
assert response.status==200 and json.loads(response.read())['total']==6
conn.close();ok('Catalog consumes a separately transmitted POST body before returning the response')
before=call('/api/merchant/overview',headers=auth)
for qty,effective in [(1,2),(3,2),(5,4),(100,20)]:
 q=call('/api/merchant/quote',{'productId':'shelf','quantity':qty},auth)
 assert q['effectiveQuantity']==effective and q['quote']['lineItems'][0]['quantity']==effective and not q['sideEffects']
q4=call('/api/merchant/quote',{'productId':'mug','quantity':4,'customerGroup':'business'},auth)
q5=call('/api/merchant/quote',{'productId':'mug','quantity':5,'customerGroup':'business'},auth)
assert q4['quote']['lineItems'][0]['discountPercent']==10 and q5['quote']['lineItems'][0]['discountPercent']==15
assert q5['quote']['price']['taxStatus']=='net'
after=call('/api/merchant/overview',headers=auth)
assert before['summary']['orders']==after['summary']['orders'] and before['products']==after['products']
ok('Side-effect-free preview uses minimum, steps, maximum and real rule-selected B2B net pricing')
c=call('/store-api/checkout/cart',{'session':str(uuid.uuid4())},{'x-commerce-locale':'fr-FR'});h={'sw-context-token':c['token'],'x-commerce-locale':'fr-FR'}
c=call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'shelf','quantity':3}]},h)
assert c['lineItems'][0]['quantity']==2 and c['locale']=='fr-FR' and 'Étagère' in c['lineItems'][0]['label']
assert call('/store-api/checkout/cart',headers=h)['lineItems']==c['lineItems'];ok('Original quantity normalization and localized cart persist through actual customer path')
foreign=call('/api/merchant/overview',headers={**auth,'x-tenant':'workshop'})
assert foreign['tenant']=='workshop' and foreign['knowledge']['graph']['tenant']=='workshop'
assert not ({o['id'] for o in foreign['orders']} & {o['id'] for o in after['orders']});ok('Studio facts retain the tenant boundary')
if os.environ.get('TEST_MODEL')=='1':
 h={**auth,'x-commerce-locale':'fr-FR'}
 v=call('/api/agent/chat',{'message':'Explique en français les observations enregistrées du shop. Donne le nombre de commandes de démonstration et les vues/achats par variante. Ne modifie rien.'},h)
 task=v['messages'][-1]['data'];assert not task.get('error'),task
 assert task['preview']['locale']=='fr-FR' and task['preview']['proposal']['changes']==[]
 facts=task['preview']['verifiedFacts'];assert facts['demoOrderCount']==after['summary']['orders']
 assert facts['learningSignals'] and facts['modelWeightsUpdated']==False
 summary=task['preview']['proposal']['summary'];assert str(facts['demoOrderCount']) in summary
 assert any(w in summary.lower() for w in ['comparaison','comparer','comparison']) and any(w in summary.lower() for w in ['découverte','découvrir','discovery']),summary
 assert all(str(s['views']) in summary and str(s['purchases']) in summary for s in facts['learningSignals']),summary
 assert call('/api/merchant/overview',headers=auth)['products']==after['products'];ok('Live Qwen answers in French using persisted order and learning facts without changing products')
 h={**auth,'x-commerce-locale':'de-DE'}
 v=call('/api/agent/chat',{'message':'Erkläre die gespeicherten Ansichten und belohnten Demo-Bestellungen je Storefront-Variante sowie den Unterschied zwischen beobachteter Kaufquote und dem geglätteten Auswahlwert. Ändere nichts.'},h)
 task=v['messages'][-1]['data'];assert not task.get('error'),task
 assert task['preview']['locale']=='de-DE' and task['preview']['proposal']['changes']==[]
 summary=task['preview']['proposal']['summary'];facts=task['preview']['verifiedFacts']
 assert all(str(s['views']) in summary and str(s['purchases']) in summary for s in facts['learningSignals']),summary
 if all(s['views']==s['purchases'] and s['views']>0 for s in facts['learningSignals']):assert '100' in summary,summary
 assert call('/api/merchant/overview',headers=auth)['products']==after['products'];ok('Live German answer distinguishes recorded layout outcomes from a smoothed policy estimate')
report=dict(passed=len(checks),checks=checks,liveLocalModel=os.environ.get('TEST_MODEL')=='1',payment='simulated')
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
