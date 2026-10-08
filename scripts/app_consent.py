#!/usr/bin/env python3
"""Installation/upgrade consent uses the actual reviewed digest and full permissions; no fixture auto-consent."""
import copy,json,os,pathlib,urllib.request,urllib.error,uuid
BASE=os.environ['BASE_URL'];ROOT=pathlib.Path(__file__).resolve().parents[1]
def call(path,body=None,h=None,status=200):
 r=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**(h or {})})
 try:
  with urllib.request.urlopen(r,timeout=20) as out:code=out.status;v=json.load(out)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 assert code==status,(path,code,status,v);return v
s=uuid.uuid4().hex[:10];u=call('/api/auth/register',{'name':'Consent','email':s+'@example.test','password':'Synthetic-consent-2026!','workspaceId':'consent-'+s});h={'Authorization':'Bearer '+u['token'],'x-tenant':u['workspace']}
m=json.loads((ROOT/'extensions/apps/care-studio/manifest.json').read_text());m['id']='consent_'+s
v={'manifest':m};review=call('/api/apps/review',v,h);assert sorted(review['added'])==sorted(m['permissions'])
call('/api/apps',v,h,409)
approved={**v,'approve':True,'digest':review['digest'],'permissions':sorted(set(review['permissions']))}
call('/api/apps',{**approved,'digest':'0'*64},h,409);call('/api/apps',{**approved,'permissions':[]},h,409)
call('/api/apps',approved,h)
n=copy.deepcopy(m);n['version']='.'.join([*m['version'].split('.')[:2],str(int(m['version'].split('.')[2])+1)]);n['permissions'].extend(['customers.read','customers.pii']);nv={'manifest':n};r=call('/api/apps/review',nv,h);assert sorted(r['added'])==['customers.pii','customers.read'];call('/api/apps',{**approved,'manifest':n},h,409)
call('/api/apps',{**nv,'approve':True,'digest':r['digest'],'permissions':r['permissions']},h)
print('PASS mandatory complete permission consent, changed digest/upgrade rejection and precise permission diff')
