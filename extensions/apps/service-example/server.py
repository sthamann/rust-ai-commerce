#!/usr/bin/env python3
"""Standalone app service with its own UI and durable event inbox. Run separately from the core."""
import json,os,sqlite3,pathlib,sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'sdk'))
from ui_bundle import bundle
from events import envelopes
UI=bundle(pathlib.Path(__file__).with_name('index.html').read_text())
DB=os.getenv('APP_DB','app-events.sqlite');TOKEN=os.getenv('APP_TOKEN','development-service-token')
with sqlite3.connect(DB) as db:db.execute('CREATE TABLE IF NOT EXISTS events(tenant TEXT NOT NULL,event_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(tenant,event_key))')
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def send(self,code,body,kind='application/json'):
        self.send_response(code);self.send_header('Content-Type',kind);self.send_header('Access-Control-Allow-Origin','*' if self.path=='/sdk.js' else 'null');self.end_headers();self.wfile.write(body if isinstance(body,bytes) else json.dumps(body).encode())
    def do_GET(self):
        if self.path=='/sdk.js':return self.send(200,(ROOT/'sdk/browser.js').read_bytes(),'text/javascript')
        if self.path not in ('/', '/ui'):return self.send(404,{})
        self.send(200,UI,'text/html')
    def do_POST(self):
        if self.headers.get('Authorization')!='Bearer '+TOKEN:return self.send(401,{})
        tenant=self.headers.get('x-tenant');length=int(self.headers.get('Content-Length','0'))
        if not tenant or length>65536:return self.send(400,{})
        value=json.loads(self.rfile.read(length))
        if self.path=='/actions/availability':return self.send(200,{'sku':value.get('sku'),'available':True,'source':'synthetic workshop example, not a real ERP'})
        if self.path=='/events':
            try:items=envelopes(value,tenant,os.getenv('APP_ID','service_example'))
            except ValueError as error:return self.send(400,{'error':str(error)})
            with sqlite3.connect(DB) as db:
                duplicates=[db.execute('INSERT OR IGNORE INTO events VALUES(?,?,?)',(tenant,item['idempotencyKey'],json.dumps(item))).rowcount==0 for item in items]
            return self.send(200,{'received':True,'duplicate':all(duplicates),'accepted':len(items)})
        self.send(404,{})
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',int(os.getenv('APP_PORT','8795'))),Handler).serve_forever()
