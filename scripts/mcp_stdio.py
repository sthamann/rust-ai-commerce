#!/usr/bin/env python3
"""Line-delimited MCP stdio bridge for Claude Desktop and other local clients.
No stdout logging. COMMERCE_SESSION_TOKEN selects a personal scoped account.
No credential is needed for public product/cart tools. MERCHANT_TOKEN is legacy instance-admin setup.
"""
import json, os, sys, urllib.request, urllib.error

endpoint = os.environ.get('COMMERCE_URL', 'http://127.0.0.1:8787').rstrip('/') + '/mcp'
headers = {'Content-Type': 'application/json', 'Accept': 'application/json',
           'x-tenant': os.environ.get('COMMERCE_TENANT', 'atelier')}
credential=os.getenv('COMMERCE_SESSION_TOKEN') or os.getenv('MERCHANT_TOKEN')
if credential:
    headers['Authorization'] = 'Bearer ' + credential
for line in sys.stdin:
    try:
        message = json.loads(line)
        req = urllib.request.Request(endpoint, data=json.dumps(message).encode(), headers=headers)
        with urllib.request.urlopen(req, timeout=240) as response:
            payload = response.read()
        if 'id' in message and payload:
            print(json.dumps(json.loads(payload)), flush=True)
    except Exception as error:
        # Never include URLs, credentials or provider exception payloads.
        if isinstance(locals().get('message'), dict) and 'id' in message:
            print(json.dumps({'jsonrpc':'2.0','id':message['id'],'error':{'code':-32603,'message':'Commerce bridge request failed'}}), flush=True)
        else:
            print('Commerce notification could not be delivered', file=sys.stderr, flush=True)
