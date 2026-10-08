#!/usr/bin/env python3
"""Real long-action identity/idempotency/lease/CAS/tenant/quota checks, without external or paid effects."""
import json,os,uuid,subprocess,urllib.request,urllib.error
from testing.runtime import ROOT
from testing.database import psql
from testing.app_approval import consent
base=os.environ['BASE_URL'];t='jobs-'+uuid.uuid4().hex[:10]
def call(path,body=None,h=None,status=200):
 if path=='/api/apps' and body is not None:body=consent(body)
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(path,code,status,v);return v
u=call('/api/auth/register',{'workspaceId':t,'name':'Job owner','email':t+'@example.test','password':'Synthetic-jobs-password!'});h={'x-tenant':t,'Authorization':'Bearer '+u['token']}
def sql(query):
 r=subprocess.run(psql(os.environ['TEST_DB_CONTAINER'],'commerce',os.environ['TEST_DATABASE'],'-qAt','-v','ON_ERROR_STOP=1'),input=query,text=True,capture_output=True);assert not r.returncode,r.stderr;return r.stdout.strip()
m={'id':'jobs_fixture','version':'1.0.0','coreApi':'1','runtime':'service','name':{'en':'Job fixture','de':'Auftragsbeispiel','fr':'Exemple de tâche','es':'Ejemplo de tarea'},'permissions':['jobs.read','jobs.write','events:self'],'events':['app.jobs_fixture.job_export'],'actions':[{'name':'export','handler':'job','description':'Fixture export','permission':'apps.manage','public':False,'inputSchema':{'type':'object','properties':{'sentinel':{'type':'string'}},'required':['sentinel'],'additionalProperties':False}}]}
call('/api/apps',{'manifest':m},h);prefix='/api/apps/jobs_fixture';digest=next(p for p in call('/api/apps',h=h)['packages'] if p['id']==m['id'])['digest'];key=call(prefix+'/credentials',{'digest':digest,'approve':True,'permissions':['jobs.write'],'expiresInDays':1},h);kh={**h,'Authorization':'Bearer '+key['key']}
call(prefix+'/actions/export',{'sentinel':'secret input'},h,400)
start={**h,'Idempotency-Key':'fixture-export'};job=call(prefix+'/actions/export',{'sentinel':'secret input'},start)['jobId'];again=call(prefix+'/actions/export',{'sentinel':'secret input'},start);assert again['jobId']==job and again['reused'];call(prefix+'/actions/export',{'sentinel':'different'},start,409)
assert json.loads(sql(f"SELECT data FROM outbox WHERE tenant='{t}' AND kind='app.jobs_fixture.job_export'"))=={'jobId':job}
assert 'secret input' not in json.dumps(call(prefix+'/jobs',h=h))
read_key=call(prefix+'/credentials',{'digest':digest,'approve':True,'permissions':['jobs.read'],'expiresInDays':1},h)
call(prefix+'/core/job_claim',{'id':job},{**h,'Authorization':'Bearer '+read_key['key']},403)
claim=call(prefix+'/core/job_claim',{'id':job},kh);assert claim['input']['sentinel']=='secret input';call(prefix+'/core/job_claim',{'id':job},kh,409)
call(prefix+'/core/job_progress',{'id':job,'lease':'wrong','progress':1},kh,409)
call(prefix+'/core/job_progress',{'id':job,'lease':claim['lease'],'progress':25,'message':{'en':'Working','de':'In Arbeit','fr':'En cours','es':'En curso'}},kh)
call(prefix+'/core/job_progress',{'id':job,'lease':claim['lease'],'progress':24},kh,400)
sql(f"UPDATE app_jobs SET lease_until=now()-interval '1 second' WHERE tenant='{t}' AND id='{job}'")
call(prefix+'/core/job_progress',{'id':job,'lease':claim['lease'],'status':'succeeded','result':{'export':'late'}},kh,409)
entry=call(prefix+'/jobs',h=h)['jobs'][0];assert entry['status']=='uncertain'
call(prefix+'/jobs/'+job,{'revision':entry['revision'],'operation':'retry'},h,409)
call(prefix+'/jobs/'+job,{'revision':entry['revision'],'operation':'retry','approveUnknownOutcome':True},h)
new=call(prefix+'/core/job_claim',{'id':job},kh);assert new['lease']!=claim['lease'];call(prefix+'/core/job_progress',{'id':job,'lease':claim['lease'],'status':'succeeded'},kh,409)
entry=call(prefix+'/jobs',h=h)['jobs'][0];call(prefix+'/jobs/'+job,{'revision':entry['revision']-1,'operation':'cancel'},h,409);call(prefix+'/jobs/'+job,{'revision':entry['revision'],'operation':'cancel'},h)
assert call(prefix+'/core/job_progress',{'id':job,'lease':new['lease']},kh)['cancelRequested']
call(prefix+'/core/job_progress',{'id':job,'lease':new['lease'],'status':'cancelled'},kh)
entry=call(prefix+'/jobs',h=h)['jobs'][0];assert entry['status']=='cancelled';call(prefix+'/jobs/'+job,{'revision':entry['revision'],'operation':'archive'},h);assert not call(prefix+'/jobs',h=h)['jobs']
print('PASS durable app jobs: idempotency, minimized outbox, progress, cancellation, late/stale leases, explicit uncertain retry and CAS')
other=t+'-other';u2=call('/api/auth/register',{'workspaceId':other,'name':'Other job owner','email':other+'@example.test','password':'Synthetic-jobs-password!'});oh={'x-tenant':other,'Authorization':'Bearer '+u2['token']};call('/api/apps',{'manifest':m},oh);call(prefix+'/core/job_claim',{'id':'foreign'},kh,404);call(prefix+'/core/job_claim',{'id':job},{**kh,'x-tenant':other},403)
ids=[]
for n in range(10):ids.append(call(prefix+'/actions/export',{'sentinel':str(n)},{**h,'Idempotency-Key':'quota-'+str(n)})['jobId'])
call(prefix+'/actions/export',{'sentinel':'over'},{**h,'Idempotency-Key':'over'},429)
assert len(call(prefix+'/jobs',h=h)['jobs'])==10 and not call(prefix+'/jobs',h=oh)['jobs']
sql(f"UPDATE memberships SET role='viewer',permissions='[\"catalog.read\"]' WHERE tenant='{t}' AND user_id=(SELECT id FROM merchant_users WHERE email='{t}@example.test')")
call(prefix+'/core/job_claim',{'id':ids[0]},kh,403)
assert sql(f"SELECT status FROM app_jobs WHERE tenant='{t}' AND id='{ids[0]}'")=='queued'
print('PASS app jobs: foreign identity/objects remain inaccessible, quotas are tenant/app scoped and current creator rights fence disclosure/execution')
