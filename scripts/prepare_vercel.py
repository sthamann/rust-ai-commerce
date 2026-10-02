#!/usr/bin/env python3
"""Render same-origin Vercel API proxy configuration; no credentials, deployments or account changes."""
import argparse,json,pathlib,urllib.parse
p=argparse.ArgumentParser();p.add_argument('--backend',required=True);p.add_argument('--output',default='frontend/vercel.json');a=p.parse_args();u=urllib.parse.urlparse(a.backend)
if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ['', '/']:p.error('Backend must be an HTTPS origin without credentials/path/query')
origin=a.backend.rstrip('/');prefixes=['/api','/store-api','/media','/mcp','/ucp','/.well-known','/health']
rewrites=[]
for prefix in prefixes:
 rewrites.append({'source':prefix,'destination':origin+prefix})
 rewrites.append({'source':prefix+'/:path*','destination':origin+prefix+'/:path*'})
rewrites.append({'source':'/:path*','destination':'/index.html'})
config={'$schema':'https://openapi.vercel.sh/vercel.json','framework':'vite','buildCommand':'npm run build','outputDirectory':'dist','rewrites':rewrites,'headers':[{'source':'/(api|store-api|mcp|ucp)(.*)','headers':[{'key':'Cache-Control','value':'private, no-store'}]}]}
f=pathlib.Path(a.output);f.parent.mkdir(parents=True,exist_ok=True);f.write_text(json.dumps(config,indent=2)+'\n');print('Prepared',f,'with same-origin API proxy to',origin)
