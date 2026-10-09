#!/usr/bin/env python3
"""Real HTTP/PG regression for bounded reads and concurrent cart edits.

Fixtures belong to one freshly registered test tenant. An explicit database
container is required; no existing shop is altered.
"""
from testing.database import psql
import argparse,concurrent.futures,json,os,pathlib,subprocess,time,urllib.request,urllib.error,uuid

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--container',required=True)
args=parser.parse_args()
base=os.getenv('BASE_URL','http://127.0.0.1:8787');checks=[]

def call(path,body=None,headers=None,expected=200,method=None):
    request=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(headers or {})},method=method)
    # Admission rejects before the handler. Preserve the identical revision/body
    # and retry only explicit transient capacity rejection, never a conflict or timeout.
    for attempt in range(20):
        try:
            with urllib.request.urlopen(request,timeout=30) as response:status=response.status;data=json.load(response)
        except urllib.error.HTTPError as response:status=response.code;data=json.load(response)
        if status!=429 or expected==429:break
        assert data['errors'][0]['detail'] in ['Workspace concurrency limit reached across service replicas; retry shortly','Resource concurrency limit reached'],data
        time.sleep(.05*(attempt+1))
    assert status==expected,(path,status,data)
    return data

def sql(source):
    return subprocess.check_output(psql(args.container,'commerce',os.getenv('TEST_DATABASE','commerce'),'-qAt','-v','ON_ERROR_STOP=1'),input='SET search_path=public;\n'+source,text=True).strip()

def ok(name):checks.append(name);print('PASS',name,flush=True)

tenant='scale-test-'+uuid.uuid4().hex[:12]
user=call('/api/auth/register',{'email':uuid.uuid4().hex+'@example.test','name':'Scaling regression','password':uuid.uuid4().hex+'!Aa1','workspaceId':tenant,'workspaceName':'Synthetic scaling test'})
headers={'x-tenant':tenant,'x-commerce-locale':'de-DE'}
merchant={**headers,'Authorization':'Bearer '+user['token']}
sql(f"""
INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock)
SELECT '{tenant}','page-'||lpad(i::text,4,'0'),'Page item '||i,'pagegroup','Synthetic bounded catalog regression',24.9,19,100
FROM generate_series(0,124) i;
UPDATE products SET name='HiddenSourceNeedle' WHERE tenant='{tenant}' AND id='page-0000';
UPDATE products SET name='Literal%_marker' WHERE tenant='{tenant}' AND id='page-0001';
INSERT INTO product_translations(tenant,product_id,language_id,name,description) VALUES
('{tenant}','page-0000','11111111111111111111111111111111','Sichtbarer Name','Sichtbare Beschreibung'),
('{tenant}','page-0124','11111111111111111111111111111111','Später Treffer','Übersetzung nach Seitengrenze'),
('{tenant}','page-0002','11111111111111111111111111111111','Zweisprachig',NULL);
INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock)
VALUES('{tenant}','family-test','Family','pagegroup','Large variant family',24.9,19,100);
INSERT INTO products(tenant,id,parent_id,name,category,description,price,tax_rate,stock,options)
SELECT '{tenant}','family-variant-'||lpad(i::text,4,'0'),'family-test','Variant','pagegroup','Synthetic variant',24.9,19,100,jsonb_build_object('size',i::text)
FROM generate_series(1,120) i;
INSERT INTO product_reviews(id,tenant,product_id,session,author,rating,title,content,approved)
VALUES('review-{tenant}','{tenant}','family-variant-0120','fixture','Fixture',5,'Last-page review','Synthetic approved review',true);
""")
first=call('/store-api/product',{},headers)
assert len(first['elements'])==50 and first['hasMore'] and first['total'] is None
cursor=None;seen=set()
while True:
    page=call('/store-api/product',{'limit':7,**({'after':cursor} if cursor else {})},headers)
    ids=[p['id'] for p in page['elements']]
    assert len(ids)<=7 and not (seen & set(ids))
    seen.update(ids)
    if not page['hasMore']:break
    assert page['nextCursor']==ids[-1]
    cursor=page['nextCursor']
assert len(seen)==int(sql(f"SELECT count(*) FROM products WHERE tenant='{tenant}' AND parent_id IS NULL;"))
ok('Cursor pages cover the complete tenant catalog without duplicates or whole-catalog totals')
for locale in ['de-DE','de-CH']:
    page=call('/store-api/product',{'search':'Später'}, {**headers,'x-commerce-locale':locale})
    assert [p['id'] for p in page['elements']]==['page-0124']
assert [p['id'] for p in call('/store-api/product',{'search':'Zweisprachig Synthetic'},headers)['elements']]==['page-0002']
assert not call('/store-api/product',{'search':'HiddenSourceNeedle'},headers)['elements']
assert [p['id'] for p in call('/store-api/product',{'search':'%_'},headers)['elements']]==['page-0001']
assert not call('/store-api/product',{'search':"%' OR true --"},headers)['elements']
assert all(p['category']=='pagegroup' for p in call('/store-api/product',{'category':'pagegroup'},headers)['elements'])
ok('Server search finds later-page translations, respects fallback visibility and treats SQL/wildcard text literally')
call('/api/automation/channels/ordered_channel',{'revision':0,'data':{
    'name':{locale:'Ordered search fixture' for locale in ['en','de','fr','es']},
    'kind':'storefront','active':True,'locales':['en-GB','de-DE','fr-FR','es-ES'],
    'productIds':[]}},merchant,method='PUT')
sql(f"""
INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock,active)
SELECT '{tenant}','ordered-'||lpad(i::text,4,'0'),'Ordered source '||i,
CASE WHEN i<10 THEN 'othergroup' ELSE 'orderedgroup' END,'Search fixture',24.9,19,100,i<10 OR i>=20
FROM generate_series(0,159) i;
INSERT INTO product_translations(tenant,product_id,language_id,name,description)
SELECT '{tenant}','ordered-'||lpad(i::text,4,'0'),'11111111111111111111111111111111','OrderedTranslationNeedle '||i,NULL
FROM generate_series(0,159) i;
INSERT INTO product_channel_visibility(tenant,product_id,channel_id,visible)
SELECT '{tenant}','ordered-'||lpad(i::text,4,'0'),'ordered_channel',false FROM generate_series(20,29) i;
""")
ordered=[];cursor=None
while True:
    page=call('/store-api/product',{'search':'OrderedTranslationNeedle','category':'orderedgroup','limit':17,
                                  **({'after':cursor} if cursor else {})},
              {**headers,'sw-sales-channel-id':'ordered_channel'})
    ids=[p['id'] for p in page['elements']]
    ordered.extend(ids)
    if not page['hasMore']:break
    cursor=page['nextCursor']
assert ordered==['ordered-'+str(i).zfill(4) for i in range(30,160)]
ok('Common translated hits paginate completely after excluding wrong categories, inactive products and hidden channel rows')
admin=call('/api/search/product',{'search':'Später'},merchant)
mcp=call('/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'catalog.search','arguments':{'query':'Später','limit':7}}},headers)['result']['structuredContent']
assert admin['elements']==mcp['elements']
overview=call('/api/merchant/overview',headers=merchant)
assert len(overview['products'])==50 and overview['productsPagination']['hasMore']
ok('Merchant catalog, overview and MCP consume the bounded server query')
variants=set();cursor=None
while True:
    path='/store-api/product/family-test?limit=20'+('&after='+cursor if cursor else '')
    page=call(path,headers=headers)
    assert len(page['variants'])<=21 and page['reviews']['count']==1
    children={p['id'] for p in page['variants'] if p['parent_id']=='family-test'}
    assert not (variants & children);variants.update(children)
    if not page['variantsPagination']['hasMore']:break
    cursor=page['variantsPagination']['nextCursor']
assert len(variants)==120
deep=call('/store-api/product/family-variant-0120?limit=20',headers=headers)
assert deep['product']['id']=='family-variant-0120' and len(deep['variants'])<=22
assert any(p['id']=='family-variant-0120' for p in deep['variants'])
ok('Large variant families paginate, retain deep links and aggregate reviews from every family page')
call('/store-api/product/family-test',headers={**headers,'x-tenant':'workshop'},expected=404)
assert not call('/store-api/product',{'search':'Später'},{**headers,'x-tenant':'workshop'})['elements']
for criteria in [{'limit':0},{'limit':101},{'after':'x'*201},{'search':'x'*201}]:call('/store-api/product',criteria,headers,400)
call('/store-api/product/family-test?limit=0',headers=headers,expected=400)
ok('Tenant boundaries and input limits apply to catalog and detail')

def edit_independent(_):
    c=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},headers)
    h={**headers,'sw-context-token':c['token']}
    updated=call('/store-api/checkout/cart',{'revision':c['revision'],'items':[{'id':'page-0124','quantity':2}]},h,method='PUT')
    assert updated['lineItems'][0]['quantity']==2 and updated['revision']==c['revision']+1
with concurrent.futures.ThreadPoolExecutor(max_workers=32) as pool:list(pool.map(edit_independent,range(64)))
c=call('/store-api/checkout/cart',{'session':uuid.uuid4().hex},headers);h={**headers,'sw-context-token':c['token']}
def competing_edit(_):
    request=urllib.request.Request(base+'/store-api/checkout/cart',data=json.dumps({'revision':c['revision'],'items':[{'id':'page-0124','quantity':2}]}).encode(),headers={'Content-Type':'application/json',**h},method='PUT')
    try:
        with urllib.request.urlopen(request,timeout=30) as response:return response.status
    except urllib.error.HTTPError as response:return response.code
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:statuses=list(pool.map(competing_edit,range(8)))
assert statuses.count(200)==1 and statuses.count(409)==7,statuses
ok('32 concurrent independent cart edits complete with bounded admission retry; competing revisions commit exactly once')
time.sleep(1.3)
assert int(sql(f"SELECT calls FROM channel_metrics WHERE tenant='{tenant}' AND channel='storefront';"))>=100
ok('Batched diagnostic counters reach PostgreSQL without a database task per request')
report={'suite':'bounded-catalog','passed':len(checks),'checks':checks,'rootProducts':len(seen),'familyVariants':len(variants),'independentEdits':64,'competingEdits':statuses}
print(json.dumps(report,indent=2))
if os.getenv('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
