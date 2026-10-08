#!/usr/bin/env python3
"""Independent, language-neutral export example. Only scoped commerce callbacks; no core SQL or hosted Python dependency."""
import csv,io,json,os,pathlib,sys,urllib.request,urllib.error
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'sdk'))
from events import envelopes
APP='catalog_export';TENANT=os.environ['APP_TENANT'];KEY=os.environ['APP_CALLBACK_KEY'];GATEWAY=os.environ['APP_TOKEN'];BASE=os.environ['COMMERCE_URL'].rstrip('/')
def core(operation,body):
    req=urllib.request.Request(BASE+'/api/apps/'+APP+'/core/'+operation,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','x-tenant':TENANT,'Authorization':'Bearer '+KEY})
    with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)
def upload(product,data):
    boundary='vendune-export-file';fields={'productId':product,'title':json.dumps({'en':'Catalog export'}),'kind':'attachment'}
    parts=[f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k,v in fields.items()]
    parts+=[f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="catalog.csv.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode()+data+b'\r\n',f'--{boundary}--\r\n'.encode()]
    req=urllib.request.Request(BASE+'/api/apps/'+APP+'/core/asset_upload',data=b''.join(parts),headers={'Content-Type':'multipart/form-data; boundary='+boundary,'x-tenant':TENANT,'Authorization':'Bearer '+KEY})
    with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)
def csv_text(value):
    text=str(value)
    return "'"+text if text.lstrip().startswith(('=','+','-','@')) else text
def execute(identifier):
    claim=core('job_claim',{'id':identifier});lease=claim['lease'];inputs=claim['input'];out=io.StringIO();writer=csv.writer(out);writer.writerow(['id','productNumber','stock'])
    for n,product in enumerate(inputs['ids']):
        check=core('job_progress',{'id':identifier,'lease':lease,'progress':int(n*80/len(inputs['ids'])),'message':{'en':'Reading products','de':'Produkte lesen','fr':'Lecture des produits','es':'Leyendo productos'}})
        if check['cancelRequested']:core('job_progress',{'id':identifier,'lease':lease,'status':'cancelled'});return
        p=core('product',{'id':product});writer.writerow([p['id'],csv_text(p['catalog'].get('productNumber','')),p['commerce']['stock']])
    asset=upload(inputs['productId'],out.getvalue().encode())
    core('job_progress',{'id':identifier,'lease':lease,'status':'succeeded','result':{'assetId':asset['id'],'digest':asset['digest']}})
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*_):pass
    def do_POST(self):
        status=200;body={'accepted':True}
        try:
            if self.path!='/events' or self.headers.get('Authorization')!='Bearer '+GATEWAY or self.headers.get('x-tenant')!=TENANT:raise ValueError('Unauthorized event context')
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=65536:raise ValueError('Event size limit')
            for event in envelopes(json.loads(self.rfile.read(length)),TENANT,APP):
                if event['kind']=='app.catalog_export.job_export':execute(event['data']['jobId'])
        except urllib.error.HTTPError as error:
            # A replay after a claimed/completed job must not repeat the export. Expired leases require Studio review.
            status=200 if error.code==409 else 502;body={'accepted':error.code==409,'callbackStatus':error.code}
        except (ValueError,KeyError,OSError):status=400;body={'error':'Invalid event or callback unavailable'}
        raw=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',int(os.getenv('APP_PORT','8796'))),Handler).serve_forever()
