#!/usr/bin/env python3
"""Real composite-FK multi-relations: per-tenant schemas, atomic quotas/revisions, hostile references and cyclic staging clone."""
import copy,json,os,subprocess,urllib.request,urllib.error,uuid
from testing.database import psql
from testing.runtime import ROOT
from testing.app_approval import consent
base=os.environ['BASE_URL'];suffix=uuid.uuid4().hex[:10];tenant='relations-'+suffix
text={'en':'Related records','de':'Verbundene Datensätze','fr':'Enregistrements liés','es':'Registros relacionados'}
def call(path,body=None,h=None,status=200):
 if path=='/api/apps':body=consent(body)
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
 try:
  with urllib.request.urlopen(req,timeout=30) as out:code=out.status;v=json.load(out)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(path,code,status,v);return v

def sql(statement,fail=False):
 r=subprocess.run(psql(os.environ['TEST_DB_CONTAINER'],'commerce',os.environ['TEST_DATABASE'],'-qAt','-v','ON_ERROR_STOP=1'),input=statement,text=True,capture_output=True)
 assert (r.returncode!=0 if fail else r.returncode==0),r.stderr
 return r.stdout.strip()
def owner(tenant):
 u=call('/api/auth/register',{'workspaceId':tenant,'name':'Relations owner','email':tenant+'@example.test','password':'Synthetic-relations-2026!'});return {'Authorization':'Bearer '+u['token'],'x-tenant':tenant}
def app():
 m=json.loads((ROOT/'extensions/apps/assistant-examples/integration.json').read_text());m['id']='relation_fixture';m['runtime']='declarative';m['events']=[];m['permissions']=['data.read','data.write','admin.slot'];m['surfaces']=[];m['views']=[];m['apiRoutes']=[];m.pop('intelligence',None)
 m['entities']=[{'name':name,'publicRead':True,'label':text,'fields':[{'name':'title','kind':'string','required':True,'label':text},{'name':'related','kind':'relations','references':target,'label':text}]} for name,target in [('left','right'),('right','left')]]
 m['actions']=[{'name':handler+'_'+name,'handler':handler,'entity':name,'description':handler+' '+name,'public':handler=='list','inputSchema':{'type':'object','properties':{'id':{'type':'string'},'revision':{'type':'integer'},'fields':{'type':'object'}} if handler=='save' else {'limit':{'type':'integer'},'after':{'type':'string'}},'required':['id','fields'] if handler=='save' else [],'additionalProperties':False}} for name in ['left','right'] for handler in ['list','save']]
 return m
h=owner(tenant);other=owner('other-'+tenant);m=app();call('/api/apps',{'manifest':m},h);call('/api/apps',{'manifest':m},other)
def save(side,id,related,h=h,revision=0,status=200):return call('/api/apps/'+m['id']+'/actions/save_'+side,{'id':id,'revision':revision,'fields':{'title':id,'related':related}},h,status)
save('right','r1',[]);save('right','r2',[]);save('left','l1',['r1','r2']);usage=call('/api/apps/'+m['id']+'/activity',h=h)['storage'];assert usage['rows']==5,usage
save('right','foreign',[],other);save('left','bad',['foreign'],status=409);assert call('/api/apps/'+m['id']+'/activity',h=h)['storage']==usage
save('left','duplicate',['r1','r1'],status=400);save('left','limit',['r1']*101,status=400)
save('right','r1',['l1'],revision=1);save('left','l1',[],revision=0,status=409)
rows=call('/api/apps/'+m['id']+'/actions/list_left',{},h)['elements'];assert rows[0]['related']==['r1','r2'];assert len(call('/api/apps/'+m['id']+'/actions/list_left',{},other)['elements'])==0
print('PASS multi-relations preserve arrays, composite tenant ownership, atomic quota rollback, uniqueness/size bounds and revision conflicts')
import hashlib
name='app_'+hashlib.sha256((tenant+':'+m['id']).encode()).hexdigest()[:24]+'_right'
assert 'violates foreign key constraint' in subprocess.run(psql(os.environ['TEST_DB_CONTAINER'],'commerce',os.environ['TEST_DATABASE'],'-qAt','-v','ON_ERROR_STOP=1'),input=f"DELETE FROM {name} WHERE tenant='{tenant}' AND id='r1';",text=True,capture_output=True).stderr
stage=call('/api/environments',{'name':'Relation clone'},h)['id'];stage_h={**h,'x-tenant':stage}
assert call('/api/apps/'+m['id']+'/actions/list_left',{},stage_h)['elements'][0]['related']==['r1','r2']
print('PASS cyclic public app graphs clone atomically into staging; deleting a referenced target is blocked by PostgreSQL')
