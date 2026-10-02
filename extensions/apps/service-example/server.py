#!/usr/bin/env python3
"""Standalone app service with its own UI and durable event inbox. Run separately from the core."""
import json,os,sqlite3,pathlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
ROOT=pathlib.Path(__file__).resolve().parents[2]
DB=os.getenv('APP_DB','app-events.sqlite');TOKEN=os.getenv('APP_TOKEN','development-service-token')
with sqlite3.connect(DB) as db:db.execute('CREATE TABLE IF NOT EXISTS events(tenant TEXT NOT NULL,event_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(tenant,event_key))')
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def send(self,code,body,kind='application/json'):
        self.send_response(code);self.send_header('Content-Type',kind);self.send_header('Access-Control-Allow-Origin','*' if self.path=='/sdk.js' else 'null');self.end_headers();self.wfile.write(body if isinstance(body,bytes) else json.dumps(body).encode())
    def do_GET(self):
        if self.path=='/sdk.js':return self.send(200,(ROOT/'sdk/browser.js').read_bytes(),'text/javascript')
        if self.path!='/':return self.send(404,{})
        html='''<!doctype html><html lang="en"><meta charset="utf-8"><style>body{font:15px system-ui;color:#213b55;padding:22px;background:#f4f9ff}button,input{padding:10px;border:1px solid #bcd0e4;border-radius:8px}pre{white-space:pre-wrap}</style><h2 id="heading">Workshop app</h2><p id="hint">Independent app interface</p><button id="notes">Read shop notes</button><form id="availability"><input id="sku" required placeholder="Product SKU"><button>Check availability</button></form><pre id="output"></pre><script type="module">import {connectCommerce} from '/sdk.js';const sdk=await connectCommerce();const text={en:['Workshop app','Independent app interface','Read shop notes','Product SKU','Check availability','No shop notes yet','Synthetic availability example'],de:['Werkstatt-App','Eigenständige App-Oberfläche','Shopnotizen lesen','Artikelnummer','Verfügbarkeit prüfen','Noch keine Shopnotizen','Synthetisches Verfügbarkeitsbeispiel'],fr:['App atelier','Interface indépendante','Lire les notes','Référence produit','Vérifier la disponibilité','Aucune note','Exemple de disponibilité simulée'],es:['App taller','Interfaz independiente','Leer notas','Referencia del producto','Consultar disponibilidad','Aún no hay notas','Ejemplo de disponibilidad simulada']}[sdk.locale.slice(0,2)]??[];document.querySelector('#heading').textContent=text[0];document.querySelector('#hint').textContent=text[1];document.querySelector('#notes').textContent=text[2];document.querySelector('#sku').placeholder=text[3];document.querySelector('#availability button').textContent=text[4];document.querySelector('#notes').onclick=async()=>{try{document.querySelector('#output').textContent=((await sdk.action('notes')).elements.map(row=>row.title).join('\\n')||text[5]);}catch(e){document.querySelector('#output').textContent=e.message;}};document.querySelector('#availability').onsubmit=async e=>{e.preventDefault();try{document.querySelector('#output').textContent=((await sdk.action('availability',{sku:document.querySelector('#sku').value})).sku+' · '+text[6]);}catch(e){document.querySelector('#output').textContent=e.message;}};</script></html>'''
        self.send(200,html.encode(),'text/html')
    def do_POST(self):
        if self.headers.get('Authorization')!='Bearer '+TOKEN:return self.send(401,{})
        tenant=self.headers.get('x-tenant');length=int(self.headers.get('Content-Length','0'))
        if not tenant or length>65536:return self.send(400,{})
        value=json.loads(self.rfile.read(length))
        if self.path=='/actions/availability':return self.send(200,{'sku':value.get('sku'),'available':True,'source':'synthetic workshop example, not a real ERP'})
        if self.path=='/events':
            with sqlite3.connect(DB) as db:
                cursor=db.execute('INSERT OR IGNORE INTO events VALUES(?,?,?)',(tenant,value['idempotencyKey'],json.dumps(value)));duplicate=cursor.rowcount==0
            return self.send(200,{'received':True,'duplicate':duplicate})
        self.send(404,{})
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',int(os.getenv('APP_PORT','8795'))),Handler).serve_forever()
