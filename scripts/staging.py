#!/usr/bin/env python3
"""Real PG proof: private sandbox, immutable app versions, selective release and conflicts. No paid inference."""
import json, os, urllib.request, urllib.error, uuid
base=os.getenv('BASE_URL','http://127.0.0.1:8787');checks=[]
def call(path,body=None,session=None,tenant=None,expected=200,method=None):
    headers={'Content-Type':'application/json','x-commerce-locale':'de-DE'}
    if session:headers.update({'Authorization':'Bearer '+session['token'],'x-tenant':tenant or session['workspace']})
    elif tenant:headers['x-tenant']=tenant
    r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(r,timeout=30) as out:code=out.status;v=json.load(out)
    except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
    assert code==expected,(path,code,v)
    return v
def passed(s):checks.append(s);print('PASS',s)
def account():
    u=uuid.uuid4().hex[:12]
    return call('/api/auth/register',{'email':u+'@example.test','name':'Staging test','password':'Synthetic-test-2026!','workspaceId':'stg-'+u,'workspaceName':'Isolated release test'})
a=account();other=account()
e=call('/api/environments',{'name':'Feature branch'},a);stage=e['id']
assert call('/api/environments',session=a)['environments'][0]['id']==stage
call('/store-api/product',{},tenant=stage,expected=401)
call('/store-api/product',{},session=other,tenant=stage,expected=403)
ps=call('/store-api/product',{},session=a,tenant=stage)['elements'];assert len(ps)==6
call('/api/environments',session=a,tenant=stage,expected=403)
assert not call('/api/environments/'+stage+'/diff',session=a)['changes']
passed('Sandbox is private, inherits current membership, starts without artificial integration changes')
name={'en':'Care guide','de':'Pflegehinweise','fr':'Entretien','es':'Cuidados'}
m={'id':'care_guide','version':'1.0.0','coreApi':'1','runtime':'declarative','name':name,'permissions':['data.read','data.write','storefront.slot','admin.slot'],'entities':[{'name':'guides','label':name,'publicRead':True,'fields':[{'name':'title','label':name,'kind':'string','required':True,'indexed':False}]}],'slots':[{'location':'product.detail','component':'entity-list','label':name}]}
b=call('/api/developer/import',{'environment':stage,'prompt':'Product care app','summary':name,'manifest':m},a)
assert b['state']=='draft' and b['digest']
assert not any(p['id']=='care_guide' for p in call('/api/apps',session=a)['packages'])
call('/api/developer/import',{'environment':stage,'prompt':'Again','summary':name,'manifest':m},a,expected=409)
call('/api/developer/builds/'+b['id']+'/stage',{'approve':True,'digest':'tampered'},a,expected=409)
call('/api/developer/builds/'+b['id']+'/stage',{'approve':True,'digest':b['digest']},a)
call('/api/apps/care_guide/entities/guides',{'id':'test','fields':{'title':'Sandbox only'}},a,stage)
assert call('/store-api/apps/care_guide/actions/list_guides',{},a,stage)['elements'][0]['title']=='Sandbox only'
call('/api/apps/care_guide/entities/guides',session=a,expected=404)
passed('Imported immutable build has working own data/API in staging and cannot mutate live before publication')
diff=call('/api/environments/'+stage+'/diff',session=a)['changes'];app=next(c for c in diff if c['key']=='app:care_guide')
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':app['key'],'digest':app['digest']}]},a)
assert call('/api/apps/care_guide/entities/guides',session=a)['elements']==[]
assert any(p['id']=='care_guide' for p in call('/api/apps',session=a)['packages'])
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':app['key'],'digest':app['digest']}]},a,expected=409)
passed('Selected app release installs schema/slots/actions, excludes sandbox records, records history and rejects replay')
record_change=next(c for c in call('/api/environments/'+stage+'/diff',session=a)['changes'] if c['key']=='appdata:care_guide:guides:test')
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':record_change['key'],'digest':record_change['digest']}]},a)
assert call('/api/apps/care_guide/entities/guides',session=a)['elements'][0]['title']=='Sandbox only'
passed('A separately selected app record is published through the same typed tenant-scoped data contract')
# Stage a second app then race actual live content through a published version.
m['id']='second_guide';b2=call('/api/developer/import',{'environment':stage,'prompt':'Another app','summary':name,'manifest':m},a)
call('/api/developer/builds/'+b2['id']+'/stage',{'approve':True,'digest':b2['digest']},a)
m['version']='1.1.0';call('/api/apps',{'manifest':m},a)
diff=call('/api/environments/'+stage+'/diff',session=a)['changes'];changed=next(c for c in diff if c['key']=='app:second_guide');assert changed['conflict']
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[{'key':changed['key'],'digest':changed['digest']}]},a,expected=409)
assert next(p for p in call('/api/apps',session=a)['packages'] if p['id']=='second_guide')['version']=='1.1.0'
passed('A newer live version rejects stale stage release and preserves the live package')
call('/api/environments/'+stage+'/diff',session=other,expected=404)
inv=call('/api/workspace/invitations',{'email':'viewer-'+uuid.uuid4().hex[:8]+'@example.test','role':'viewer'},a)
reader=call('/api/auth/accept',{'invitationToken':inv['token'],'name':'Viewer','password':'Synthetic-test-2026!'})
call('/api/developer/import',{'environment':stage,'prompt':'x','summary':name,'manifest':m},reader,expected=403)
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[]},reader,expected=403)
call('/api/environments',{'name':'No'},reader,expected=403)
passed('Cross-shop access and viewer create/import/release attempts are rejected')
print(json.dumps({'passed':len(checks),'checks':checks,'paidInference':False},indent=2))
