#!/usr/bin/env python3
"""Real HTTP/PostgreSQL branching automation, private facts, durable delays and revoked-actor regressions. No providers."""
import copy,json,os,subprocess,time,uuid,urllib.request,urllib.error
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8787');suffix=uuid.uuid4().hex[:10];checks=[]
def call(path,body=None,h=None,method=None,expected=200):
    req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method)
    try:
        with urllib.request.urlopen(req,timeout=30) as r:status=r.status;v=json.load(r)
    except urllib.error.HTTPError as e:status=e.code;v=json.load(e)
    assert status==expected,(path,status,expected,v)
    return v
def sql(statement):
    return subprocess.check_output(['docker','exec','-i','rust-ai-commerce-postgres-1','psql','-U','commerce','-d',os.environ['TEST_DATABASE'],'-At','-v','ON_ERROR_STOP=1'],input=statement,text=True).strip()
def check(s):checks.append(s);print('PASS',s,flush=True)
def register(label):return call('/api/auth/register',{'workspaceId':label+'-'+suffix,'workspaceName':label,'name':'Owner','email':label+suffix+'@example.test','password':'Synthetic-flow-2026!'})
a=register('automate');foreign=register('autoforeign');t=a['workspace'];mh={'x-tenant':t,'Authorization':'Bearer '+a['token']};public={'x-tenant':t};fh={'x-tenant':t,'Authorization':'Bearer '+foreign['token']};names={l:'Automation '+l for l in ['en','de','fr','es']}
def mcp(name,v,h=mh):return call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':v}},h)['result']
def save(id,data,revision=0):return call('/api/automation/flows/'+id,{'data':data,'revision':revision},mh,'PUT')
def source(name,**config):return {'type':'shopwareCondition','name':name,'config':config}
def flow(nodes,event='order.placed'):
    return {'name':names,'active':True,'event':event,'condition':{'type':'alwaysValid'},'action':'pipeline','instruction':names,'locale':'de-DE','pipeline':{'entry':nodes[0]['id'],'nodes':nodes}}
def action(id,name,config,next=None):return {'kind':'action','id':id,'action':name,'config':config,'next':next}
def wait(flowid,state='completed'):
    for _ in range(120):
        jobs=call('/api/automation',h=mh)['jobs'];found=[j for j in jobs if j['flow']==flowid and j['state']==state]
        if found:return found[0]
        time.sleep(.1)
    raise AssertionError((flowid,state,jobs))
catalog=call('/api/automation/catalog',h=mh);assert len(catalog['sourceConditions'])==114 and len(catalog['sourceActions'])==16
assert {'condition','action','delay','stop'}==set(catalog['pipelineContract']['nodes'])
assert any(x['type']=='scriptRule' and not x['supported'] for x in catalog['sourceConditions'])
assert not any(x['name'].startswith('automation.')for x in call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list'})['result']['tools'])
call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'automation.list','arguments':{}}},fh,expected=403)
check('Original production catalog and MCP tools expose executable scope and tenant authority explicitly')
p=call('/api/merchant/products/mug',h=mh)
call('/api/automation/entities/products/mug',{'revision':p['revision'],'data':{'width':100,'height':100,'length':100,'markAsTopseller':True,'customFields':{'material':'ceramic'},'purchasePrices':{'gross':10,'net':8}}},mh,'PUT')
call('/api/automation/entities/products/mug',{'revision':p['revision'],'data':{}},mh,'PUT',409)
call('/api/automation/entities/products/mug',{'revision':p['revision']+1,'data':{'price':0}},mh,'PUT',400)
c=call('/store-api/checkout/cart',{},public);ch={**public,'sw-context-token':c['token']}
c=call('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':'mug','quantity':2}]},ch,'PUT')
assert 'automation' not in call('/store-api/product/mug',{},public)['product']['extra']
assert 'ruleFacts' not in c and 'customer' not in c
for condition in [source('cartLineItemPromoted',isPromoted=True),source('cartTotalPurchasePrice',operator='=',type='net',amount=16),source('cartLineItemCustomField',operator='=',renderedField={'name':'material','type':'text'},renderedFieldValue='ceramic')]:
    assert mcp('automation.preview',{'condition':condition},{**mh,**ch})['structuredContent']['matched']
missing=source('orderCustomField',operator='=',renderedField={'name':'absent','type':'text'},renderedFieldValue='x')
assert mcp('automation.preview',{'condition':{'type':'notContainer','child':missing}},{**mh,**ch})['isError']
check('Revision-bound product metadata drives real cart rules; missing authority under NOT fails and private facts never escape')
customer=call('/store-api/account/register',{'email':'customer'+suffix+'@example.test','name':'Buyer','password':'Synthetic-buyer-2026!'},public)
ch={**public,'x-customer-token':customer['customerToken']};c=call('/store-api/checkout/cart',{},ch);ch['sw-context-token']=c['token']
c=call('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':'mug','quantity':1}]},ch,'PUT')
call('/api/automation/rules/positive',{'revision':0,'data':{'name':names,'active':True,'condition':source('cartCartAmount',operator='>',amount=0)}},mh,'PUT')
assert mcp('automation.preview',{'condition':{'type':'ruleReference','ruleId':'positive'}},{**mh,**ch})['structuredContent']['matched']
assert mcp('automation.preview',{'condition':{'type':'ruleReference','ruleId':'foreign'}},{**mh,**ch})['isError']
first=flow([{'kind':'condition','id':'branch','condition':{'type':'ruleReference','ruleId':'positive'},'on_true':'tag','on_false':'stop'},action('tag','action.add.customer.tag',{'tagIds':['vip']},'delay'),{'kind':'delay','id':'delay','seconds':2,'next':'recheck'},{'kind':'condition','id':'recheck','condition':{'type':'ruleReference','ruleId':'positive'},'on_true':'state','on_false':'stop'},action('state','action.set.order.state',{'kind':'order','state':'in_progress'},'field'),action('field','action.set.order.custom.field',{'field':'handled','value':True},'stop'),{'kind':'stop','id':'stop'}]);save('pipeline',first)
false=flow([{'kind':'condition','id':'branch','condition':source('cartCartAmount',operator='>',amount=100000),'on_true':'wrong','on_false':'correct'},action('wrong','action.add.order.tag',{'tags':['wrong']}),action('correct','action.add.order.tag',{'tags':['false-branch']})]);save('false_branch',false)
call('/api/merchant/receipts/settings',{'revision':0,'data':{'name':'Synthetic Flow Seller','address':'Test 1, Berlin','taxId':'TEST-ONLY'}},mh,'PUT')
invoice=flow([action('document','action.generate.document',{'kind':'invoice'})]);save('invoice',invoice)
invalid=copy.deepcopy(first);invalid['pipeline']['nodes'][1]['next']='branch';call('/api/automation/flows/cycle',{'data':invalid,'revision':0},mh,'PUT',400)
invalid=flow([{'kind':'delay','id':'long','seconds':2592001,'next':None}]);call('/api/automation/flows/long',{'data':invalid,'revision':0},mh,'PUT',400)
check('Graph admission rejects cycles and delays beyond thirty days before saving')
# One corrupted rule must become a visible failed job instead of poisoning the outbox for other flows.
save('bad_scope',flow([action('note','note',{'instruction':names})]))
sql("UPDATE commerce_flows SET data=jsonb_set(data,'{condition}','{\"type\":\"shopwareCondition\",\"name\":\"missing_runtime\",\"config\":{}}') WHERE tenant='"+t+"' AND id='bad_scope';")
save('bad_references',flow([action('note','note',{'instruction':names})]))
excessive=json.dumps({'type':'andContainer','children':[{'type':'ruleReference','ruleId':'missing'+str(i)}for i in range(101)]})
sql("UPDATE commerce_flows SET data=jsonb_set(data,'{condition}','"+excessive+"') WHERE tenant='"+t+"' AND id='bad_references';")
o=call('/store-api/checkout/order',{}, {**ch,'Idempotency-Key':'automation-'+suffix})
for _ in range(100):
    jobs=call('/api/automation',h=mh)['jobs'];waiting=[j for j in jobs if j['flow']=='pipeline' and j['state']=='queued' and j.get('cursor')=='recheck']
    if waiting:break
    time.sleep(.05)
assert waiting,'Pipeline did not persist its delayed cursor'
call('/api/automation/rules/positive',{'revision':1,'data':{'name':names,'active':True,'condition':source('cartCartAmount',operator='>',amount=100000)}},mh,'PUT')
assert not mcp('automation.preview',{'condition':{'type':'ruleReference','ruleId':'positive'}},{**mh,**ch})['structuredContent']['matched']
completed=wait('pipeline');assert completed['result']['stopped'] and len(completed['result']['trace'])>=4
wait('false_branch');wait('invoice');bad=wait('bad_scope','failed');assert 'Unknown Shopware rule' in bad['error'];assert 'Maximum 100 referenced rules' in wait('bad_references','failed')['error']
read=call('/api/merchant/orders/'+o['id'],h=mh);assert read['state']=='in_progress'
assert json.loads(sql("SELECT data->'automation' FROM orders WHERE id='"+o['id']+"'"))=={'customFields':{'handled':True},'tags':['false-branch']}
assert json.loads(sql("SELECT automation FROM customers WHERE tenant='"+t+"' AND id='"+o['orderCustomer']['customerId']+"'"))['tags']==['vip']
assert len(call('/api/merchant/orders/'+o['id']+'/receipts',h=mh)['elements'])==1
assert int(sql("SELECT count(*) FROM flow_steps WHERE job='"+completed['id']+"' AND state='completed'"))==3
check('Committed checkout runs true/false branches, a persisted delay, customer tags, guarded state, custom fields and one immutable invoice')
check('A changed saved rule affects current preview while a delayed event continues with its frozen original rule version')
check('Broken scope and oversized reference sets fail independently while other flows and checkout continue')
# Replaying a previously confirmed graph reuses its per-node receipts, without repeating transitions or tags.
sql("UPDATE flow_jobs SET state='queued',cursor=NULL WHERE id='"+completed['id']+"';")
wait('pipeline');time.sleep(.5)
assert int(sql("SELECT count(*) FROM flow_steps WHERE job='"+completed['id']+"'"))==3
assert int(sql("SELECT count(*) FROM order_activity WHERE order_id='"+o['id']+"' AND kind='transition'"))==1
check('Replayed flow jobs reuse persisted action results rather than repeat side effects')
# Delay execution rechecks current permissions rather than preserving the creating actor's old grant.
for id in ['pipeline','false_branch','invoice']:
    current=next(x for x in call('/api/automation',h=mh)['flows']if x['id']==id);save(id,{**current['data'],'active':False},current['revision'])
sql("UPDATE commerce_flows SET data=jsonb_set(data,'{active}','false') WHERE tenant='"+t+"' AND id IN ('bad_scope','bad_references');")
revoked=flow([{'kind':'delay','id':'pause','seconds':60,'next':'effect'},action('effect','action.add.order.tag',{'tags':['must-not-run']})]);save('revoked',revoked)
c=call('/store-api/checkout/cart',{},public);h={**public,'sw-context-token':c['token']};c=call('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':'notebook','quantity':1}]},h,'PUT');second=call('/store-api/checkout/order',{}, {**h,'Idempotency-Key':'revoke-'+suffix})
queued=wait('revoked','queued')
sql("UPDATE memberships SET active=false WHERE tenant='"+t+"'; UPDATE flow_jobs SET available_at=now() WHERE id='"+queued['id']+"';")
for _ in range(100):
    if sql("SELECT state FROM flow_jobs WHERE id='"+queued['id']+"'")=='failed':break
    time.sleep(.1)
assert sql("SELECT state FROM flow_jobs WHERE id='"+queued['id']+"'")=='failed'
assert sql("SELECT data->'automation'->'tags' FROM orders WHERE id='"+second['id']+"'") in ['','null']
sql("UPDATE memberships SET active=true WHERE tenant='"+t+"';")
check('Revoking a delayed flow actor prevents the future mutation')
print(json.dumps({'passed':len(checks),'paidProviderCalls':0,'checks':checks}))
