#!/usr/bin/env python3
"""Local HTTP latency sample. Does not claim production or Shopware speedup."""
import urllib.request,concurrent.futures,time,json,os,pathlib
base=os.environ.get('BASE_URL','http://127.0.0.1:8787')
def one(_):
    start=time.perf_counter()
    req=urllib.request.Request(base+'/store-api/product',data=b'{}',headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req) as r: assert len(json.load(r)['elements'])==6
    return (time.perf_counter()-start)*1000
start=time.perf_counter()
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:timings=sorted(pool.map(one,range(500)))
elapsed=time.perf_counter()-start
report={'route':'POST /store-api/product','requests':500,'concurrency':16,'seconds':round(elapsed,3),'requestsPerSecond':round(500/elapsed,1),'p50Ms':round(timings[249],2),'p95Ms':round(timings[474],2),'p99Ms':round(timings[494],2),'environment':'localhost, six products, debug binary, PostgreSQL Docker; no external network, no LLM','comparison':'No Shopware baseline; not a production capacity claim'}
print(json.dumps(report,indent=2))
if os.environ.get('REPORT_PATH'):pathlib.Path(os.environ['REPORT_PATH']).write_text(json.dumps(report,indent=2)+'\n')
