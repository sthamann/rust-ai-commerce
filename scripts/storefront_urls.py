#!/usr/bin/env python3
"""Real HTTP product deep links and host isolation in disposable shops."""
import json, os, urllib.request, urllib.error, uuid
base = os.environ['BASE_URL']
def call(path, body=None, headers=None, method=None, expected=200):
    req = urllib.request.Request(base+path, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type':'application/json', **(headers or {})}, method=method)
    try:
        with urllib.request.urlopen(req) as r: status, value = r.status, r.read()
    except urllib.error.HTTPError as e: status, value = e.code, e.read()
    assert status == expected, (path, status, expected, value[:200])
    return json.loads(value) if value.startswith(b'{') else value
shops = []
for _ in range(2):
    shop = 'urls-'+uuid.uuid4().hex[:12]
    user = call('/api/auth/register', {'workspaceId':shop,'workspaceName':'URL fixture','name':'Synthetic owner','email':shop+'@example.test','password':'Synthetic-URLs-2026!'})
    shops.append((shop, {'x-tenant':shop,'Authorization':'Bearer '+user['token']}))
one, admin = shops[0]; two, other = shops[1]
for path in ['/products/mug', '/products/mug/tasse-aus-keramik']:
    html = call(path, headers={'Host':one+'.vendune.ai'})
    assert b'id="root"' in html and b'assets/' in html
    call(path+'?shop='+one+'&language=de-DE')
    call(path+'?shop='+two, headers={'Host':one+'.vendune.ai'}, expected=400)
    call(path, headers={'Host':one+'.vendune.ai','x-tenant':two}, expected=400)
call('/products/not-a-product', headers={'Host':one+'.vendune.ai'}, expected=404)
call('/products/mug', headers={'Host':'no-such-shop-123.vendune.ai'}, expected=404)
p = call('/api/merchant/products/mug', headers=admin)
p['catalog']['active'] = False
call('/api/merchant/products/mug', p, admin, 'PUT')
call('/products/mug/tasse', headers={'Host':one+'.vendune.ai'}, expected=404)
call('/products/mug/tasse', headers={'Host':two+'.vendune.ai'})
call('/store-api/not-a-route', headers={'Host':one+'.vendune.ai'}, expected=404)
print('PASS product HTML, localized deep links, unknown/inactive products, host/query/header isolation and API 404s')
