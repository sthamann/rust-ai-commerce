#!/usr/bin/env python3
"""Real assistant packages: editor context, rights, MCP opt-out, cron, signed webhooks, flows and local service fixtures."""
from testing.database import psql
from testing.app_approval import pin, consent
import concurrent.futures
import copy
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from testing.runtime import ROOT, serve, stop

suffix = uuid.uuid4().hex[:10]
tenant = 'assistants-' + suffix
secret = 'synthetic-webhook-signing-key-' + suffix
seen = []


class Service(BaseHTTPRequestHandler):
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.headers['Authorization'] == 'Bearer local-service-fixture'
        seen.append((self.path, self.headers['x-tenant'], data))
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'synchronized': True}).encode())

    def log_message(self, *_):
        pass


fixture = ThreadingHTTPServer(('127.0.0.1', 0), Service)
threading.Thread(target=fixture.serve_forever, daemon=True).start()
env = dict(os.environ)
base = env['BASE_URL']
env['APP_SERVICES'] = json.dumps(pin({'example_integration': {'url': f'http://127.0.0.1:{fixture.server_port}', 'token': 'local-service-fixture'}}, 'example_integration', json.loads((ROOT/'extensions/apps/assistant-examples/integration.json').read_text())))
env['APP_WEBHOOK_KEYS'] = json.dumps({tenant: {'example_webhook': secret}})
env['PROCESS_ROLE'] = 'all'
log_path = ROOT / 'artifacts/app-assistants-server.log'
log_path.parent.mkdir(exist_ok=True)


def call(path, body=None, headers=None, expected=200, method=None, raw=None):
    if path == "/api/apps" and body is not None:
        body = consent(body)
    data = raw if raw is not None else (None if body is None else json.dumps(body).encode())
    req = urllib.request.Request(base + path, data=data, headers={'Content-Type': 'application/json', **(headers or {})}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as out:
            status, value = out.status, json.load(out)
    except urllib.error.HTTPError as e:
        status, value = e.code, json.load(e)
    assert status in (expected if isinstance(expected, tuple) else (expected,)), (path, status, expected, value)
    return value


def sql(statement):
    return subprocess.run(psql(env.get('TEST_DB_CONTAINER', 'vendune-postgres-1'),'commerce',env['TEST_DATABASE'],'-At','-v','ON_ERROR_STOP=1','-c',statement), check=True, text=True, capture_output=True).stdout.strip()


def wait(predicate):
    for _ in range(150):
        if predicate():
            return
        time.sleep(.1)
    raise AssertionError('Expected durable effect did not arrive')


def manifest(kind):
    return json.loads((ROOT / f'extensions/apps/assistant-examples/{kind}.json').read_text())


def mcp(h, name, arguments=None):
    return call('/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': name, 'arguments': arguments or {}}}, h)['result']


def signed(payload, event_id='incoming-1', stamp=None, target=tenant):
    raw = json.dumps(payload, separators=(',', ':')).encode()
    stamp = str(stamp or int(time.time()))
    digest = hashlib.sha256(raw).hexdigest()
    message = '\n'.join([target, 'example_webhook', 'incoming', stamp, event_id, digest])
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return raw, {'x-app-timestamp': stamp, 'x-app-event-id': event_id, 'x-app-signature': signature}


with log_path.open('w') as log:
    server = serve(env, base, log)
    try:
        account = call('/api/auth/register', {'workspaceId': tenant, 'workspaceName': 'Assistant fixtures', 'name': 'Owner', 'email': suffix + '@example.test', 'password': 'Synthetic-assistant-2026!'})
        headers = {'x-tenant': tenant, 'Authorization': 'Bearer ' + account['token']}
        other = call('/api/auth/register', {'workspaceId': 'foreign-' + suffix, 'name': 'Other', 'email': 'foreign' + suffix + '@example.test', 'password': 'Synthetic-assistant-2026!'})
        stage = call('/api/environments', {'name': 'Assistant private'}, headers)['id']
        private = {**headers, 'x-tenant': stage}
        # All nine guided types and three editor placements are installable contracts, including service+native views.
        for kind in ['frontend', 'admin', 'combined', 'payment', 'shipping', 'integration', 'event', 'webhook', 'scheduled', 'customer', 'order', 'product_general']:
            m = manifest(kind)
            b = call('/api/developer/import', {'environment': stage, 'prompt': 'Guided fixture', 'summary': m['name'], 'manifest': m}, headers)
            call('/api/developer/builds/' + b['id'] + '/stage', {'approve': True, 'digest': b['digest']}, headers)
        print('PASS all assistant kinds import, version and install through the real private development lifecycle')
        m = manifest('admin')
        path = '/api/apps/' + m['id']
        fields = {'product_id': 'mug', 'title': {'en': 'Care'}, 'body': {'en': 'Wash gently'}, 'segment': 'standard'}
        call(path + '/actions/save_entries', {'id': 'care', 'revision': 0, 'fields': fields}, private)
        page = call(path + '/actions/list_entries', {'limit': 50, 'filter': {'product_id': 'mug'}}, private)
        assert page['elements'][0]['title']['en'] == 'Care'
        assert call(path + '/actions/list_entries', {'limit': 50, 'filter': {'product_id': 'chair'}}, private)['elements'] == []
        call(path + '/actions/save_entries', {'id': 'bad', 'fields': {**fields, 'product_id': 'nonexistent'}}, private, 400)
        call(path + '/actions/save_entries', {'id': 'bad', 'fields': {**fields, 'segment': 'injected'}}, private, 400)
        call(path + '/actions/save_entries', {'id': 'care', 'revision': 0, 'fields': fields}, private, 409)
        call(path + '/actions/save_entries', {'id': 'bad', 'fields': fields}, {'x-tenant': stage, 'Authorization': 'Bearer ' + other['token']}, 403)
        print('PASS owned editor references, indexed context separation, choice validation, revisions and foreign-shop rejection')
        # Scoped credentials exercise every action entry, including the legacy entity endpoint.
        key = call('/api/workspace/integrations', {'name': 'Read catalog only', 'permissions': ['catalog.read', 'catalog.write'], 'expiresInDays': 1}, headers)
        kh = {'x-tenant': stage, 'Authorization': 'Bearer ' + key['key']}
        # Keys are shop-bound: check scoped endpoint in live workspace after install.
        call('/api/apps', {'manifest': m}, headers)
        order_app = manifest('order')
        call('/api/apps', {'manifest': order_app}, headers)
        kh['x-tenant'] = tenant
        call('/api/apps/example_order/actions/list_entries', {'limit': 1}, kh, 403)
        call('/api/apps/example_order/entities/entries', headers=kh, expected=403)
        call('/api/apps/example_order/entities/entries', {'id': 'x', 'fields': {}}, kh, 403)
        surfaces = call('/api/apps/surfaces', headers=kh)['surfaces']
        assert not any(s['app'] == 'example_order' for s in surfaces)
        assert mcp(headers, 'app.example_admin.list_entries')['isError']
        listed = call('/mcp', {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'}, headers)['result']['tools']
        assert not any(t['name'].startswith('app.example_admin.') for t in listed)
        m['version'] = '0.1.1'
        m['actions'][0]['mcp'] = True
        call('/api/apps', {'manifest': m}, headers)
        assert not mcp(headers, 'app.example_admin.list_entries').get('isError', False)
        print('PASS separate MCP discovery/invocation opt-out and real team rights through HTTP, direct entity routes and registry')
        # Personal core references exist only in the owned shop, and cannot be public.
        shopper = call('/store-api/account/register', {'name': 'Buyer', 'email': 'buyer' + suffix + '@example.test', 'password': 'Synthetic-buyer-2026!'}, {'x-tenant': tenant})
        profile = call('/store-api/account/profile', headers={'x-tenant': tenant, 'x-customer-token': shopper['customerToken']})
        customer_app = manifest('customer')
        call('/api/apps', {'manifest': customer_app}, headers)
        cf = {'customer_id': profile['id'], 'title': {'en': 'Service level'}, 'segment': 'priority'}
        call('/api/apps/example_customer/actions/save_entries', {'id': 'customer', 'fields': cf}, headers)
        call('/api/apps/example_customer/actions/save_entries', {'id': 'foreign', 'fields': {**cf, 'customer_id': 'foreign-customer'}}, headers, 400)
        broken = copy.deepcopy(customer_app)
        broken['version'] = '0.1.1'
        broken['entities'][0]['publicRead'] = True
        call('/api/apps', {'manifest': broken}, headers, 400)
        print('PASS customer choice field persists against actual owned customer identity; public personal references rejected')
        # A local connector responds through the real service gateway, then receives a durable app event.
        integration = manifest('integration')
        call('/api/apps', {'manifest': integration}, headers)
        result = call('/api/apps/example_integration/actions/synchronize', {'payload': {'fixture': True}}, headers)
        assert result['synchronized']
        call('/api/apps/example_integration/actions/synchronize', {'payload': {}}, private, 400)
        print('PASS external service action is genuinely callable with server-only credentials; staging blocks egress')
        # Real webhook -> event -> persisted Flow -> managed app record, including event-field rule.
        webhook = manifest('webhook')
        call('/api/apps', {'manifest': webhook}, headers)
        flow = {'name': {'en': 'Webhook fixture'}, 'active': True, 'event': 'app.example_webhook.received', 'condition': {'type': 'eventField', 'path': 'payload.accept', 'operator': '=', 'value': True}, 'action': 'app_action', 'instruction': {'en': 'Save accepted event'}, 'locale': 'en-GB', 'appAction': {'app': 'example_admin', 'action': 'save_entries', 'arguments': {'id': 'from_webhook', 'revision': 0, 'fields': {**fields, 'title': {'en': 'From webhook'}}}}}
        call('/api/automation/flows/assistant_webhook', {'revision': 0, 'data': flow}, headers, method='PUT')
        raw, signature = signed({'payload': {'accept': True}})
        url = '/webhooks/apps/' + tenant + '/example_webhook/incoming'
        first = call(url, headers=signature, raw=raw)
        replay = call(url, headers=signature, raw=raw)
        assert replay['replayed'] and replay['eventId'] == first['eventId']
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            repeats = list(pool.map(lambda _: call(url, headers=signature, raw=raw), range(4)))
        assert all(r['eventId'] == first['eventId'] for r in repeats)
        changed, hs = signed({'payload': {'accept': False}})
        call(url, headers=hs, raw=changed, expected=409)
        call(url, headers={**signature, 'x-app-signature': '0' * 64}, raw=raw, expected=401)
        old, hs = signed({'payload': {}}, stamp=int(time.time()) - 1000)
        call(url, headers=hs, raw=old, expected=401)
        foreign_raw, hs = signed({'payload': {}}, target='foreign-' + suffix)
        call('/webhooks/apps/foreign-' + suffix + '/example_webhook/incoming', headers=hs, raw=foreign_raw, expected=404)
        wait(lambda: any(r['id'] == 'from_webhook' for r in call('/api/apps/example_admin/actions/list_entries', {'limit': 50}, headers)['elements']))
        print('PASS signed incoming webhook drives a rule-filtered durable flow; changed bodies, stale signatures, foreign shops and concurrent repeats rejected/deduplicated')
        scheduled = manifest('scheduled')
        call('/api/apps', {'manifest': scheduled}, headers)
        # Deterministically force one past-due slot; the actual background worker must consume it.
        sql(f"UPDATE app_schedules SET next_run=now()-interval '1 second' WHERE tenant='{tenant}' AND app='example_scheduled'")
        wait(lambda: sql(f"SELECT count(*) FROM app_schedule_runs WHERE tenant='{tenant}' AND app='example_scheduled'") == '1')
        assert sql(f"SELECT count(*) FROM app_schedule_runs WHERE tenant='{stage}'") == '0'
        stop(server)
        server = serve(env, base, log)
        time.sleep(.8)
        assert sql(f"SELECT count(*) FROM app_schedule_runs WHERE tenant='{tenant}' AND app='example_scheduled'") == '1'
        assert call(url, headers=signature, raw=raw)['eventId'] == first['eventId']
        scheduled['version'] = '0.1.1'
        scheduled['schedules'][0]['cron'] = '* * * * * *'
        call('/api/apps', {'manifest': scheduled}, headers, 400)
        print('PASS real persisted cron tick, no private-stage execution, no duplicate after cold restart and webhook replay receipt survives restart')
    finally:
        stop(server)
        fixture.shutdown()
