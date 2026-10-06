#!/usr/bin/env python3
"""Adversarial two-shop API/MCP/UCP/object and schema isolation with real personal/customer sessions."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import urllib.error
import urllib.request
import uuid
from security.tenant_schema import run as schema_tests

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = os.environ['BASE_URL']
PASSWORD = 'Synthetic-isolation-2026!'
checks = []


def passed(name):
    checks.append(name)
    print('PASS', name, flush=True)


def call(path, body=None, h=None, method=None, expected=200):
    raw = body if isinstance(body, bytes) else None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=raw, headers={'Content-Type': 'application/json', **(h or {})}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            code, raw = res.status, res.read()
    except urllib.error.HTTPError as err:
        code, raw = err.code, err.read()
    assert code in ((expected,) if isinstance(expected, int) else expected), (path, code, expected, raw[:500])
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def mcp(name, args, h):
    return call('/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}, h)['result']


def fixture():
    t = 'isolate-' + uuid.uuid4().hex[:12]
    user = call('/api/auth/register', {'workspaceId': t, 'workspaceName': 'Isolation fixture', 'name': 'Owner', 'email': t + '@example.test', 'password': PASSWORD})
    h = {'x-tenant': t, 'Authorization': 'Bearer ' + user['token']}
    p = {'x-tenant': t}
    integration = call('/api/workspace/integrations', {'name': 'Deletion control', 'expiresInDays': 1, 'permissions': ['orders.read']}, h)
    address = {'name': 'Test Buyer', 'firstName': 'Test', 'lastName': 'Buyer', 'street': 'Test Road 1', 'postalCode': '10115', 'city': 'Berlin', 'country': 'DE'}
    email = t + '-buyer@example.test'
    reg = call('/store-api/account/register', {'email': email, 'name': 'Test Buyer', 'password': PASSWORD, 'billingAddress': address}, p)
    customer = {**p, 'x-customer-token': reg['customerToken']}
    cart = call('/store-api/checkout/cart', {}, customer)
    ch = {**customer, 'sw-context-token': cart['token']}
    cart = call('/store-api/checkout/cart/line-item', {'items': [{'referencedId': 'mug', 'quantity': 1}]}, ch)
    order = call('/store-api/checkout/order', {}, {**ch, 'Idempotency-Key': 'security-' + t})
    call('/api/settings/master-data', {'revision': 0, 'data': {'name': 'Fixture Seller', 'address': 'Test Street 1', 'taxId': 'TEST'}}, h, 'PUT')
    receipt = call('/api/merchant/orders/' + order['id'] + '/receipts', {'revision': order['revision'], 'kind': 'invoice', 'locale': 'en', 'requestKey': 'receipt-' + t}, h)
    boundary = 'security-fixture'
    raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n{{"en":"Fixture"}}\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="manual.txt"\r\nContent-Type: text/plain\r\n\r\nPrivate fixture {t}\r\n--{boundary}--\r\n').encode()
    asset = call('/api/merchant/products/mug/assets', raw, {**h, 'Content-Type': 'multipart/form-data; boundary=' + boundary})
    doc = call('/api/knowledge/documents', {'title': 'Private fixture', 'content': 'Confidential ' + t, 'productId': 'mug'}, h)
    manifest = json.loads((ROOT / 'extensions/apps/care-studio/manifest.json').read_text())
    call('/api/apps', {'manifest': manifest}, h)
    record = {'id': 'same-id', 'fields': {'title': {'en': t}, 'instructions': {'en': 'Private-shop-context'}}, 'revision': 0}
    call('/api/apps/care_studio/actions/save_guides', record, h)
    stage = call('/api/environments', {'name': 'Private fixture'}, h)['id']
    build = call('/api/developer/import', {'environment': stage, 'prompt': 'Fixture', 'summary': {'en': 'Fixture', 'de': 'Test', 'es': 'Prueba'}, 'manifest': manifest}, h)
    return dict(tenant=t, user=user, h=h, public=p, integration=integration, customer=customer, ch=ch, email=email, cart=cart, order=order, receipt=receipt, asset=asset, doc=doc, stage=stage, build=build)


a, b = fixture(), fixture()
for attacker, victim in ((a, b), (b, a)):
    h, oid, did = attacker['h'], victim['order']['id'], victim['doc']['id']
    before_order = call('/api/merchant/orders/' + oid, h=victim['h'])
    before_doc = call('/api/knowledge/documents/' + did, h=victim['h'])
    before_keys = call('/api/workspace/integrations', h=victim['h'])
    # Authorized route, foreign object ID: authentication alone must never suffice.
    probes = [
        ('/api/merchant/orders/' + oid, None, 'GET', 404),
        ('/api/merchant/orders/' + oid + '/notes', {'revision': 1, 'text': 'forged'}, 'POST', 409),
        ('/api/merchant/orders/' + oid + '/transition', {'revision': 1, 'kind': 'order', 'state': 'cancelled'}, 'POST', 404),
        ('/api/merchant/receipts/' + victim['receipt']['id'] + '/pdf', None, 'GET', 404),
        ('/api/merchant/customers/' + victim['email'], None, 'GET', 404),
        ('/api/merchant/assets/' + victim['asset']['id'], {'public': True, 'digest': victim['asset']['digest']}, 'PUT', 409),
        ('/api/knowledge/documents/' + did, None, 'GET', 404),
        ('/api/knowledge/documents/' + did + '/lifecycle', {'revision': 1, 'archived': True, 'approve': True}, 'POST', 409),
        ('/api/environments/' + victim['stage'] + '/diff', None, 'GET', 404),
        ('/api/environments/' + victim['stage'] + '/release', {'approve': True, 'selections': []}, 'POST', 404),
        ('/api/developer/builds/' + victim['build']['id'] + '/stage', {'approve': True, 'digest': victim['build']['digest']}, 'POST', 404),
        ('/api/workspace/members/' + victim['user']['user']['id'], {'role': 'admin', 'active': False}, 'PUT', 404),
    ]
    for path, body, method, expected in probes:
        call(path, body, h, method, expected)
    # Revocation is idempotent: a foreign ID can return 200, but must delete nothing.
    call('/api/workspace/integrations/' + victim['integration']['id'], h=h, method='DELETE')
    assert call('/api/workspace/integrations', h=victim['h']) == before_keys
    call('/api/merchant/orders', h={'x-tenant': victim['tenant'], 'Authorization': 'Bearer ' + victim['integration']['key']})
    passed('Foreign reads/writes blocked and DELETE leaves foreign integration intact in both directions')
    for path in ('/api/merchant/orders/' + oid, '/api/knowledge/documents/' + did, '/api/apps', '/api/environments'):
        call(path, h={**h, 'x-tenant': victim['tenant'], 'x-rac-user': 'bootstrap', 'x-rac-role': 'owner', 'x-rac-tenant': victim['tenant']}, expected=403)
    passed('Changing shop headers and forging internal principals cannot change membership')
    for name, args in [('merchant.order', {'id': oid}), ('merchant.order.note', {'id': oid, 'revision': 1, 'text': 'forged'}), ('merchant.customer', {'id': victim['email']}), ('knowledge.source.detail', {'id': did})]:
        assert mcp(name, args, h)['isError'], (name, args)
        if name in ('merchant.order', 'merchant.customer', 'knowledge.source.detail'):
            assert not mcp(name, args, victim['h'])['isError'], name
    passed('Direct MCP invocation uses the same foreign-object guards')
    call('/store-api/account/profile', h={**victim['public'], 'x-customer-token': attacker['customer']['x-customer-token']}, expected=401)
    call('/store-api/checkout/cart', h={**victim['public'], 'sw-context-token': attacker['ch']['sw-context-token']}, expected=404)
    for path in ('', '/cancel', '/complete'):
        call('/ucp/v1/checkout-sessions/' + victim['cart']['id'] + path, None if not path else {}, attacker['ch'], 'GET' if not path else 'POST', 404)
    call('/store-api/assets/' + victim['asset']['id'], h=attacker['public'], expected=404)
    passed('Customer sessions, cart tokens, UCP IDs and binary assets cannot cross shops')
    # Same natural IDs are deliberate: a cache keyed only by ID would leak.
    for _ in range(3):
        own = call('/api/apps/care_studio/actions/list_guides', {}, h)['elements']
        assert len(own) == 1 and own[0]['title']['en'] == attacker['tenant'], own
    changed = {'id': 'same-id', 'revision': own[0]['revision'], 'fields': {'title': {'en': attacker['tenant']}, 'instructions': {'en': 'Changed only here'}}}
    call('/api/apps/care_studio/actions/save_guides', changed, h)
    other = call('/api/apps/care_studio/actions/list_guides', {}, victim['h'])['elements'][0]
    assert other['title']['en'] == victim['tenant']
    call('/api/apps/care_studio/actions/save_guides', {**changed, 'tenant': victim['tenant']}, h, expected=400)
    call('/store-api/apps/care_studio/actions/save_guides', changed, attacker['public'], expected=401)
    passed('Same app/record IDs remain separate; body scope injection and public writes fail')
    # Show that denied mutations really had no effect, rather than trusting status codes alone.
    assert call('/api/merchant/orders/' + oid, h=victim['h']) == before_order
    assert call('/api/knowledge/documents/' + did, h=victim['h']) == before_doc
    assert call('/api/developer', h=victim['h'])['builds'][0]['state'] == 'draft'
    assert not next(x for x in call('/api/merchant/products/mug/assets', h=victim['h'])['elements'] if x['id'] == victim['asset']['id'])['public']
    passed('Victim state and private publication remain unchanged after denied mutations')
# Integration key is bounded even when its owning person legitimately joins two shops.
invite = call('/api/workspace/invitations', {'email': a['user']['user']['email'], 'role': 'admin'}, b['h'])
call('/api/auth/accept', {'name': 'Owner', 'password': PASSWORD, 'invitationToken': invite['token']})
call('/api/merchant/orders', h={**a['h'], 'x-tenant': b['tenant']})
key = call('/api/workspace/integrations', {'name': 'Orders reader', 'expiresInDays': 1, 'permissions': ['orders.read']}, a['h'])
kh = {'Authorization': 'Bearer ' + key['key'], 'x-tenant': a['tenant']}
call('/api/merchant/orders', h={**kh, 'x-tenant': b['tenant']}, expected=403)
call('/api/merchant/customers', h=kh, expected=403)
call('/api/merchant/orders/' + a['order']['id'] + '/notes', {'text': 'forged', 'revision': 1}, kh, expected=403)
call('/api/workspace/integrations/' + key['id'], h=a['h'], method='DELETE')
call('/api/merchant/orders', h=kh, expected=401)
passed('Workspace-bound integration keys cannot inherit a person\'s second membership, widen scopes or survive revocation')
schema_tests(a, b, passed)
report = {'suite': 'tenant-isolation', 'passed': len(checks), 'checks': checks, 'database': 'actual PostgreSQL', 'paidCalls': 0, 'coreRls': False, 'wholeSystemCertified': False}
report['measuredAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
report['sourceCommit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
report['workingTreeChanged'] = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip())
report['sourceHashes'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ('src/migrations.rs', 'migrations/038-tenant-references.sql', 'scripts/tenant_isolation.py', 'scripts/security/tenant_schema.py')}
(ROOT / 'artifacts/tenant-isolation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
