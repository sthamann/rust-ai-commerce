#!/usr/bin/env python3
"""F5 uses actual native APIs in a personal clone; no version publication, foreign-team access or release. Synthetic only."""
from testing.app_approval import consent
import copy,json,os,pathlib,urllib.request,urllib.error,uuid
BASE=os.environ['BASE_URL'];ROOT=pathlib.Path(__file__).resolve().parents[1]
def call(path,body=None,h=None,expected=200,method=None):
 if path == '/api/apps' and isinstance(body,dict) and ('manifest' in body or 'builtIn' in body): body=consent(body)
 req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})},method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as res:code=res.status;data=json.load(res)
 except urllib.error.HTTPError as error:code=error.code;data=json.load(error)
 assert code==expected,(path,code,expected,data)
 return data
suffix=uuid.uuid4().hex[:10];password='Synthetic-app-preview-2026!'
u=call('/api/auth/register',{'name':'Preview owner','email':suffix+'@example.test','password':password,'workspaceId':'preview-'+suffix,'workspaceName':'Preview'})
h={'Authorization':'Bearer '+u['token'],'x-tenant':u['workspace']}
invite=call('/api/workspace/invitations',{'email':'colleague-'+suffix+'@example.test','role':'admin'},h)
colleague=call('/api/auth/accept',{'name':'Preview colleague','password':password,'invitationToken':invite['token']})
ch={'Authorization':'Bearer '+colleague['token'],'x-tenant':u['workspace']}
m=json.loads((ROOT/'extensions/apps/care-studio/manifest.json').read_text());m['id']='preview_'+suffix
before=call('/api/developer',h=h)['builds'];p=call('/api/developer/preview',{'manifest':m},h);stage=p['environment'];sh={**h,'x-tenant':stage}
assert p['private'] and not p['releaseAllowed']
assert not any(e['id']==stage for e in call('/api/environments',h=h)['environments'])
call('/api/environments/'+stage+'/diff',h=h,expected=404)
call('/api/environments/'+stage+'/release',{'approve':True,'selections':[]},h,expected=404)
call('/api/apps/surfaces',h={'x-tenant':stage},expected=401)
call('/api/apps/surfaces',h={**ch,'x-tenant':stage},expected=403)
call('/api/apps/'+m['id']+'/actions/list_guides',{},h,expected=404)
call('/api/apps/'+m['id']+'/actions/save_guides',{'id':'preview_record','revision':0,'fields':{'title':{'en':'Preview only'}}},sh)
assert call('/api/apps/'+m['id']+'/actions/list_guides',{},sh)['elements'][0]['title']['en']=='Preview only'
# View-only hot reload preserves data and keeps the same declared version; no immutable build is written.
next_m=copy.deepcopy(m);next_m['views'][0]['blocks'][0]['geometry']={'x':0,'y':0,'w':12,'h':6}
second=call('/api/developer/preview',{'manifest':next_m},h);assert second['environment']==stage and second['version']==p['version'] and second['digest']!=p['digest']
assert call('/api/apps/'+m['id']+'/actions/list_guides',{},sh)['elements'][0]['id']=='preview_record'
assert call('/api/developer',h=h)['builds']==before
# A data-model change resets this app's preview records instead of corrupting an old published schema.
next_m['entities'][0]['fields'].append({'name':'when','label':m['name'],'kind':'date','required':False,'indexed':False,'references':None})
call('/api/developer/preview',{'manifest':next_m},h);assert call('/api/apps/'+m['id']+'/actions/list_guides',{},sh)['elements']==[]
other=call('/api/developer/preview',{'manifest':m},ch);assert other['environment']!=stage
call('/api/apps/'+m['id']+'/actions/save_guides',{'id':'evil','fields':{}},{**ch,'x-tenant':stage},expected=403)
print('PASS F5 real records, view hot reload, schema reset, actor-private access, live/version/release isolation')
