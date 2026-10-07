#!/usr/bin/env python3
"""Explicit offline legacy-state migration; decrypted data crosses stdin only, never logs or temporary files."""
import hashlib,json,os,pathlib,sqlite3,subprocess,sys
from cryptography.fernet import Fernet
ROOT=pathlib.Path(__file__).resolve().parents[1]
state=ROOT/'.run/connector-env.json'
settings=json.loads(state.read_text()) if state.exists() else {}
env={**os.environ,**settings}
source=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else settings.get('CONNECTOR_DATABASE','.run/connector-state.sqlite'))
if not source.exists(): raise SystemExit('Legacy SQLite file not found')
# The owning Python worker must be stopped before snapshot; never migrate an actively sending worker.
pidfile=ROOT/'.run/connector.pid'
if pidfile.exists():
 command=subprocess.run(['ps','-p',pidfile.read_text().strip(),'-o','command='],capture_output=True,text=True).stdout
 if command.strip(): raise SystemExit('Stop the owned connector process before migrating')
cipher=Fernet(env['CONNECTOR_SECRET_KEY'].encode())
def clear(t,a,raw):
 value=json.loads(cipher.decrypt(raw.encode()))
 if value['tenant']!=t or value['app']!=a: raise ValueError('Legacy tenant binding mismatch')
 return value['value']
with sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True) as db:
 db.row_factory=sqlite3.Row
 result={'format':1,'configs':[],'jobs':[],'sources':[],'changes':[]}
 for row in db.execute('SELECT * FROM config'):
  result['configs'].append({'tenant':row['tenant'],'app':row['app'],'value':clear(row['tenant'],row['app'],row['data'])})
 for row in db.execute('SELECT * FROM jobs'):
  v=dict(row);v['payload']=clear(v['tenant'],v['app'],v['payload']);v['result']=clear(v['tenant'],v['app'],v['result']) if v['result'] else None;result['jobs'].append(v)
 if db.execute("SELECT 1 FROM sqlite_master WHERE name='sources'").fetchone():
  for row in db.execute('SELECT * FROM sources'):
   result['sources'].append({'tenant':row['tenant'],'app':row['app'],'id':row['id'],'value':clear(row['tenant'],row['app'],row['data'])})
 for row in db.execute('SELECT * FROM changes ORDER BY seq'):
  result['changes'].append({'tenant':row['tenant'],'app':row['app'],'seq':row['seq'],'value':clear(row['tenant'],row['app'],row['data'])})
subprocess.run([str(ROOT/'target/debug/connectors'),'--import-legacy'],input=json.dumps(result).encode(),env=env,cwd=ROOT,check=True)
# Original database remains untouched; marker only records a successful atomic import.
marker=ROOT/'.run/connector-migrated';marker.parent.mkdir(exist_ok=True)
fd=os.open(marker,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as out:out.write(hashlib.sha256(source.read_bytes()).hexdigest()+'\n')
marker.chmod(0o600)
print('Migration completed. Original encrypted SQLite preserved; restart outstanding OAuth authorization.')
