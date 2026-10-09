#!/usr/bin/env python3
"""Real native consent/layout/payment paths with synthetic live-receipt fixtures, not a measured commerce experiment."""
import json, os, urllib.request, urllib.error, subprocess, time
from testing.database import psql
base=os.environ['BASE_URL']; merchant={'Authorization':'Bearer '+os.environ['MERCHANT_TOKEN'],'x-tenant':'atelier'}
def call(path,body=None,h=None,method=None,expected=200):
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),method=method,headers={'Content-Type':'application/json',**(h or {})})
 try:
  with urllib.request.urlopen(req,timeout=30) as r:code=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==expected,(path,code,v);return v
def sql(s):return subprocess.check_output(psql(os.environ['DB_CONTAINER'],'commerce',os.environ['TEST_DATABASE'],'-XqAt','-v','ON_ERROR_STOP=1'),input=s,text=True).strip()
def command(n,v):return call('/api/intelligence/'+n,v,merchant)
c=call('/store-api/checkout/cart',{'session':'controlled-native-primary'},h={'x-tenant':'atelier'});h={'sw-context-token':c['token'],'x-tenant':'atelier'}
policy=call('/store-api/privacy/consent',h=h)
legal=call('/store-api/legal',h=h)
call('/store-api/intelligence/preferences',h=h,expected=403)
call('/store-api/privacy/consent',{'policyVersion':legal['policyVersion'],'choices':{'personalization':True}},h,method='PUT')
graph={'nodes':[{'id':'size','kind':'size','value':'M','productId':None},{'id':'owned','kind':'owned_product','value':'My desk lamp','productId':'lamp'}],'edges':[{'source':'size','target':'owned','kind':'FITS'}]}
call('/store-api/intelligence/preferences',{'graph':graph,'revision':0,'useForAdvice':False},h,method='PUT')
assert call('/store-api/intelligence/preferences',h=h)['graph']==graph
call('/store-api/intelligence/preferences',{'graph':graph,'revision':0},h,method='PUT',expected=409)
other=call('/store-api/checkout/cart',{'session':'controlled-native-secondary'},h={'x-tenant':'atelier'});otherh={**h,'sw-context-token':other['token']}
call('/store-api/privacy/consent',{'policyVersion':legal['policyVersion'],'choices':{'personalization':True}},otherh,method='PUT')
assert call('/store-api/intelligence/preferences',h=otherh)['revision']==0
call('/store-api/intelligence/preferences',h={**h,'x-tenant':'workshop'},expected=404)
print('PASS consent-required typed private graph, native context isolation, export and revision fencing')
design={'title':'Synthetic causal fixture','locale':'en-GB','channel':'default','control':'discovery','treatment':'comparison','currency':'EUR','durationHours':1,'settlementDays':14,'minimumPerArm':100,'outcomeCapMinor':10000,'cupedTheta':0.2}
call('/api/intelligence/experiment.create',{'design':design,'approve':True},expected=401)
for event in ['intelligence.experiment.changed','intelligence.experiment.result']:
 flow={'name':{'en-GB':'Synthetic intelligence notification'},'active':True,'event':event,'condition':{'type':'alwaysValid'},'action':'note','instruction':{'en-GB':'An intelligence event was processed.'},'locale':'en-GB'}
 call('/api/automation/flows/'+event.replace('.','_'),{'revision':0,'data':flow},merchant,method='PUT')
e=command('experiment.create',{'design':design,'approve':True})['id']
command('experiment.start',{'id':e,'revision':1,'approve':True})
first=call('/api/experience',{'session':'controlled-native-primary'},h)
assert first['experimentId']==e and first['propensity']==0.5 and first['arm'] in [0,1]
assert call('/api/experience',{'session':'controlled-native-primary'},h)==first
second=call('/api/experience',{'session':'controlled-native-secondary'},otherh)
assert second['experimentId']==e
report=command('experiment.report',{'id':e})
assert sum(report['unitsPerArm'])==2 and not report['causalUpliftProven'] and report['interval95'] is None
command('experiment.finish',{'id':e,'revision':2,'approve':True}) if False else call('/api/intelligence/experiment.finish',{'id':e,'revision':2,'approve':True},merchant,expected=409)
# A native demo checkout cannot count as live captured cash.
call('/store-api/checkout/cart/line-item',{'items':[{'referencedId':'lamp','quantity':1}]},h)
order=call('/store-api/checkout/order',{},h={**h,'Idempotency-Key':'synthetic-experiment-order'})
assert command('experiment.report',{'id':e})['netCollectedMinor']=='0'
print('PASS randomized persisted layout assignment affects native experience; demo purchases do not reward experiment')
# Test only: authoritative live receipt inside a disposable database, not a real payment or causal result.
id=order['id']
sql(f"INSERT INTO payment_attempts(id,tenant,order_id,provider,adapter_version,amount_minor,currency,state,environment,capture_id,bn_code) VALUES('synthetic-capture','atelier','{id}','synthetic','fixture',10000,'EUR','captured','live','fixture-receipt','fixture-no-attribution');")
assert command('experiment.report',{'id':e})['netCollectedMinor']=='10000'
sql("UPDATE payment_attempts SET refunded_minor=10000,state='refunded' WHERE id='synthetic-capture'")
assert command('experiment.report',{'id':e})['netCollectedMinor']=='0'
print('PASS native live-capture/refund amount is consumed; immature and undersized trials cannot claim an effect')
call('/store-api/privacy/consent',{'policyVersion':legal['policyVersion'],'choices':{}},h,method='PUT')
call('/store-api/intelligence/preferences',h=h,expected=403)
assert sql("SELECT count(*) FROM private_preferences WHERE tenant='atelier'")=='0'
report=command('experiment.report',{'id':e});assert report['withdrawals']==1 and sum(report['unitsPerArm'])==1 and not report['causalUpliftProven']
command('experiment.stop',{'id':e,'revision':2,'approve':True})
assert command('experiment.report',{'id':e})['stoppedEarly']
call('/api/intelligence/experiment.report',{'id':e},h={**merchant,'x-tenant':'workshop'},expected=400)
print('PASS privacy revocation erases private graph and assignment and invalidates causal inference; foreign shop denied')

# Accelerated clock in a disposable fixture: prove final readout caching and its
# actual graph/outbox consumer, without claiming an observed live-commerce effect.
e2=command('experiment.create',{'design':{**design,'title':'Final cache fixture'},'approve':True})['id']
command('experiment.start',{'id':e2,'revision':1,'approve':True})
call('/api/experience',{'session':'controlled-native-secondary'},otherh)
sql(f"UPDATE intelligence_experiments SET started_at=now()-interval '17 days',ends_at=now()-interval '16 days' WHERE tenant='atelier' AND id='{e2}';")
final=command('experiment.report',{'id':e2})
assert final['settled'] and final['finalLook'] and not final['minimumMet'] and not final['causalUpliftProven']
assert command('experiment.report',{'id':e2})==final
assert sql(f"SELECT count(*) FROM knowledge_relations WHERE tenant='atelier' AND kind='EXPERIMENT_RESULT' AND source_id='{e2}' AND state='evidenced'")=='1'
assert sql(f"SELECT count(*) FROM outbox WHERE tenant='atelier' AND kind='intelligence.experiment.result' AND data->>'id'='{e2}'")=='1'
command('experiment.stop',{'id':e2,'revision':2,'approve':True})
stopped=command('experiment.report',{'id':e2})
assert stopped['stoppedEarly'] and not stopped['finalLook'] and stopped['interval95'] is None
assert sql(f"SELECT data->>'stoppedEarly' FROM knowledge_relations WHERE tenant='atelier' AND kind='EXPERIMENT_RESULT' AND source_id='{e2}'")=='true'
call('/store-api/privacy/consent',{'policyVersion':legal['policyVersion'],'choices':{}},otherh,method='PUT')
assert command('experiment.report',{'id':e2})['withdrawals']==1
assert sql(f"SELECT count(*) FROM intelligence_assignments WHERE tenant='atelier' AND experiment_id='{e2}'")=='0'
print('PASS mature final readout persists once to graph/outbox; stop and consent withdrawal invalidate cached inference')

# Actual committed intelligence producers must reach the existing durable flow consumer.
for event in ['intelligence.experiment.changed','intelligence.experiment.result']:
 flow_id=event.replace('.','_')
 for _ in range(150):
  jobs=call('/api/automation',h=merchant)['jobs']
  job=next((j for j in jobs if j['flow']==flow_id and j['state']=='completed'),None)
  if job:break
  time.sleep(.1)
 assert job,(event,jobs)
 assert job['result']['note']=='An intelligence event was processed.'
activity=call('/api/knowledge/workspace',h=merchant)['activity']
assert any(e['kind']=='intelligence.experiment.result' for e in activity)
print('PASS committed experiment events reach the native Flow worker and localized knowledge activity catalogue')
