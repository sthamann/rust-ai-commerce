#!/usr/bin/env python3
"""Real installed-schema evolution, recovery snapshots, rollback on bad conversions and isolation of equal app IDs."""
import copy,json,os,uuid,subprocess
from testing.runtime import ROOT
from testing.database import psql
from testing.app_approval import consent
from urllib.request import Request,urlopen
from urllib.error import HTTPError
base=os.environ['BASE_URL'];tenant='schema-'+uuid.uuid4().hex[:10]
def call(path,body=None,h=None,status=200):
 if path=='/api/apps' and body is not None:body=consent(body)
 request=Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
 try:
  with urlopen(request,timeout=30) as r:code=r.status;v=json.load(r)
 except HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(path,code,status,v);return v
def owner(t):
 v=call('/api/auth/register',{'workspaceId':t,'name':'Schema owner','email':t+'@example.test','password':'Synthetic-schema-password!'});return {'x-tenant':t,'Authorization':'Bearer '+v['token']}
def sql(query):
 r=subprocess.run(psql(os.environ['TEST_DB_CONTAINER'],'commerce',os.environ['TEST_DATABASE'],'-qAt','-v','ON_ERROR_STOP=1'),input=query,text=True,capture_output=True);assert not r.returncode,r.stderr;return r.stdout.strip()
h=owner(tenant);foreign=owner('other-'+tenant)
m=json.loads((ROOT/'extensions/apps/assistant-examples/integration.json').read_text());m.update(id='schema_fixture',version='1.0.0',runtime='declarative',permissions=['data.read','data.write'],events=[],surfaces=[],views=[],apiRoutes=[]);m.pop('intelligence',None)
m['entities']=[{'name':'entries','fields':[{'name':n,'kind':'string','required':False} for n in ['title','count','obsolete']]}]
m['actions']=[{'name':op,'handler':op,'entity':'entries','description':op,'public':False,'inputSchema':{'type':'object','additionalProperties':False,'properties':{'id':{'type':'string'},'revision':{'type':'integer'},'fields':{'type':'object'}} if op=='save' else {'limit':{'type':'integer'}},'required':['id','fields'] if op=='save' else []}} for op in ['list','save']]
call('/api/apps',{'manifest':m},h);call('/api/apps',{'manifest':m},foreign)
def save(id,count,revision=0):call('/api/apps/schema_fixture/actions/save',{'id':id,'revision':revision,'fields':{'title':'Original title','count':count,'obsolete':'backup-only'}},h)
save('ok','42');save('bad','2.5')
changed=copy.deepcopy(m);changed['version']='1.1.0';changed['entities'][0]['fields']=[{'name':'caption','kind':'string'},{'name':'count','kind':'integer'},{'name':'active','kind':'boolean','required':True}]
# No inferred lossy rename or raw SQL.
call('/api/apps',{'manifest':changed},h,409)
changed['schemaMigrations']=[{'fromVersion':'1.0.0','steps':[{'op':'rename','entity':'entries','field':'title','to':'caption'},{'op':'convert','entity':'entries','field':'count'},{'op':'remove','entity':'entries','field':'obsolete'},{'op':'fill','entity':'entries','field':'active','value':True}]}]
call('/api/apps',{'manifest':changed},h,400)
rows=call('/api/apps/schema_fixture/actions/list',{},h)['elements'];assert rows[0]['count']=='2.5' and rows[1]['count']=='42';assert all('title' in row for row in rows)
assert sql(f"SELECT count(*) FROM app_schema_history WHERE tenant='{tenant}'")== '0'
assert next(p for p in call('/api/apps',h=h)['packages'] if p['id']==m['id'])['version']=='1.0.0'
print('PASS failed schema conversion rolls back records, DDL, package, recovery history and outbox atomically')
save('bad','2',1);call('/api/apps',{'manifest':changed},h)
rows=call('/api/apps/schema_fixture/actions/list',{},h)['elements'];assert rows[0]['count']==2 and rows[1]['count']==42;assert all(row['caption']=='Original title' and row['active'] is True and 'obsolete' not in row for row in rows)
assert rows[1]['revision']==2
snapshot=json.loads(sql(f"SELECT records FROM app_schema_history WHERE tenant='{tenant}'"));assert snapshot['entries'][0]['obsolete']=='backup-only';assert snapshot['entries'][1]['count']=='42'
foreign_pkg=next(p for p in call('/api/apps',h=foreign)['packages'] if p['id']==m['id']);assert foreign_pkg['version']=='1.0.0';assert call('/api/apps/schema_fixture/actions/list',{},foreign)['elements']==[]
print('PASS explicit rename/remove/type/default migration retains recovery data, bumps revisions and leaves foreign schemas untouched')
