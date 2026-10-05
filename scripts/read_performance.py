#!/usr/bin/env python3
"""Two real Rust replicas test coherent read caches; optional matched local HTTP baseline probe."""
import concurrent.futures
import hashlib
import json
import math
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from testing.runtime import ROOT, serve, stop

env = dict(os.environ)
env['PROCESS_ROLE'] = 'http'
tenant = 'read-cache-' + uuid.uuid4().hex[:10]
env['RUST_LOG'] = 'sqlx::query=debug'


def sql(text):
    return subprocess.check_output(['docker', 'exec', '-i', env['TEST_DB_CONTAINER'], 'psql', '-U', 'commerce',
        '-d', env['TEST_DATABASE'], '-qAt', '-v', 'ON_ERROR_STOP=1'], input=text, text=True).strip()


def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def call(base, path, body=None, headers=None, method=None, expected=200):
    request = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'x-tenant': tenant, **(headers or {})}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as r:
            status, value = r.status, json.load(r)
    except urllib.error.HTTPError as e:
        status, value = e.code, json.load(e)
    assert status == expected, (path, status, value)
    return value


def start(label, extra=None, binary=None):
    current = {**env, **(extra or {})}
    current['BASE_URL'] = f'http://127.0.0.1:{port()}'
    current['BIND_ADDR'] = current['BASE_URL'][7:]
    path = ROOT / ('artifacts/read-' + label + '.log')
    log = path.open('w')
    if binary:
        server = subprocess.Popen([binary], cwd=ROOT, env=current, stdout=log, stderr=log)
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError('Baseline server stopped')
            try:
                call(current['BASE_URL'], '/health')
                break
            except OSError:
                time.sleep(.1)
        else:
            stop(server)
            raise RuntimeError('Baseline server did not become ready')
    else:
        server = serve(current, current['BASE_URL'], log)
    return server, log, current['BASE_URL'], path


def close(server):
    stop(server[0])
    server[1].close()


first = start('first')
second = start('second')
bootstrap = {'Authorization': 'Bearer ' + env['MERCHANT_TOKEN']}
try:
    owner = call(first[2], '/api/auth/register', {'workspaceId': tenant, 'workspaceName': 'Read cache fixture',
        'email': tenant + '@example.test', 'name': 'Synthetic owner', 'password': 'Synthetic-2026-cache!Aa1'})
    merchant = {'Authorization': 'Bearer ' + owner['token']}
    channel = {'name': {'en': 'Secondary', 'de': 'Zweiter', 'es': 'Segundo', 'fr': 'Second'},
        'kind': 'storefront', 'active': True, 'locales': ['en-GB', 'de-DE', 'es-ES', 'fr-FR'], 'productIds': []}
    call(first[2], '/api/automation/channels/secondary', {'revision': 0, 'data': channel}, merchant, 'PUT')
    read = '/store-api/product/mug'
    channel_headers = {'sw-sales-channel-id': 'secondary'}
    for server in (first, second):
        assert call(server[2], read)['product']['tax_rate'] == 19
        assert call(server[2], read, headers=channel_headers)['product']['tax_rate'] == 19
    base = call(first[2], '/api/merchant/commerce', headers=merchant)
    base['data']['taxes'][0]['rates']['DE'] = 22
    call(first[2], '/api/merchant/commerce', base, merchant, 'PUT')
    for server in (first, second):
        assert call(server[2], read)['product']['tax_rate'] == 22
        assert call(server[2], read, headers=channel_headers)['product']['tax_rate'] == 22
    print('PASS committed basis changes are immediate in two warmed independent Rust replicas')
    # Direct SQL without a revision bump must also change the cache identity.
    sql(f"UPDATE commerce_settings SET data=jsonb_set(data,'{{taxes,0,rates,DE}}','23') WHERE tenant='{tenant}';")
    assert call(second[2], read)['product']['tax_rate'] == 23
    sql(f"BEGIN; UPDATE commerce_settings SET data=jsonb_set(data,'{{taxes,0,rates,DE}}','29') WHERE tenant='{tenant}'; ROLLBACK;")
    assert call(second[2], read)['product']['tax_rate'] == 23
    scoped = call(first[2], '/api/merchant/commerce/channels/secondary', headers=merchant)
    scoped['data']['taxes'][0]['rates']['DE'] = 7.5
    call(first[2], '/api/merchant/commerce/channels/secondary', scoped, merchant, 'PUT')
    assert call(second[2], read, headers=channel_headers)['product']['tax_rate'] == 7.5
    assert call(second[2], read)['product']['tax_rate'] == 23
    sql(f"DELETE FROM commerce_overrides WHERE tenant='{tenant}' AND channel_id='secondary';")
    assert call(second[2], read, headers=channel_headers)['product']['tax_rate'] == 23
    sql(f"WITH old AS(DELETE FROM commerce_settings WHERE tenant='{tenant}' RETURNING tenant,data,revision) INSERT INTO commerce_settings(tenant,data,revision) SELECT tenant,jsonb_set(data,'{{taxes,0,rates,DE}}','24'),revision FROM old;")
    assert call(second[2], read)['product']['tax_rate'] == 24
    sql(f"UPDATE commerce_settings SET data=jsonb_set(data,'{{taxes,0,rates,DE}}','23') WHERE tenant='{tenant}';")
    print('PASS direct writes, transaction rollback, channel overrides and override deletion keep correct tax context')
    version = sql("SELECT version FROM read_context_versions WHERE namespace='languages';")
    sql("INSERT INTO languages(id,locale) VALUES('11111111111111111111111111111111','de-DE') ON CONFLICT DO NOTHING;")
    assert sql("SELECT version FROM read_context_versions WHERE namespace='languages';") == version
    # Global registry mutations must refresh every replica and preserve NULL field inheritance.
    sql("INSERT INTO languages(id,locale,parent_id) VALUES('cccccccccccccccccccccccccccccccc','de-XZ','11111111111111111111111111111111');")
    assert call(second[2], '/store-api/context', headers={'x-commerce-locale': 'de-XZ'})['locale'] == 'de-XZ'
    sql("UPDATE languages SET locale='de-XY' WHERE id='cccccccccccccccccccccccccccccccc';")
    call(second[2], '/store-api/context', headers={'x-commerce-locale': 'de-XZ'}, expected=400)
    assert call(second[2], '/store-api/context', headers={'x-commerce-locale': 'de-XY'})['locale'] == 'de-XY'
    assert call(second[2], '/store-api/product/mug', headers={'x-tenant': 'workshop'})['product']['tax_rate'] == 19
    # Membership revocation is intentionally never cached.
    sql(f"UPDATE memberships SET active=false WHERE tenant='{tenant}' AND user_id='{owner['user']['id']}';")
    call(second[2], '/api/merchant/commerce', headers=merchant, expected=403)
    sql(f"UPDATE memberships SET active=true WHERE tenant='{tenant}' AND user_id='{owner['user']['id']}';")
    call(second[2], read, headers={'sw-sales-channel-id': 'missing'}, expected=404)
    call(second[2], '/api/runtime', headers=merchant)
    assert call(second[2], '/api/runtime', headers=merchant)['performance'] is None
    metrics = call(second[2], '/api/runtime', headers=bootstrap)['performance']['reads']
    assert metrics['decodedHits'] > 0 and metrics['requestMemoHits'] > 0
    assert metrics['settingsEntries'] <= metrics['maxSettingsEntries']
    with urllib.request.urlopen(second[2] + '/store-api/context', timeout=5) as r:
        assert r.headers['Cache-Control'] == 'no-store'
    with urllib.request.urlopen(second[2] + '/', timeout=5) as r:
        assert r.headers['Cache-Control'] == 'no-cache'
    files = list(ROOT.joinpath('frontend/dist/assets').glob('index-*.js'))
    if files:
        with urllib.request.urlopen(second[2] + '/assets/' + files[0].name, timeout=5) as r:
            assert r.headers['Cache-Control'] == 'public, max-age=31536000, immutable'
    print('PASS language registry updates, tenant boundaries, immediate membership revocation and bounded cache diagnostics')
finally:
    close(first)
    close(second)

# Same fixture survives a process restart; startup creates no inherited cached state.
fresh = start('restart')
try:
    assert call(fresh[2], read)['product']['tax_rate'] == 23
    assert call(fresh[2], read, headers=channel_headers)['product']['tax_rate'] == 23
    print('PASS cold process restart reloads current committed data')
finally:
    close(fresh)

disabled = start('disabled', {'READ_CONTEXT_CACHE': 'false', 'DB_POOL_MAX': '2', 'DB_POOL_MIN': '1'})
try:
    assert call(disabled[2], read)['product']['tax_rate'] == 23
    metrics = call(disabled[2], '/api/runtime', headers=bootstrap)['performance']['reads']
    assert not metrics['enabled'] and metrics['decodedHits'] == 0 and metrics['requestMemoHits'] == 0
    print('PASS cache-disabled fallback preserves live behavior and pool configuration')
finally:
    close(disabled)

limited = start('limited', {'DB_POOL_MAX': '1', 'DB_POOL_WAIT_MS': '100'})
try:
    basis = call(limited[2], '/api/merchant/commerce', headers=merchant)
    lock = subprocess.Popen(['docker', 'exec', '-i', env['TEST_DB_CONTAINER'], 'psql', '-U', 'commerce',
        '-d', env['TEST_DATABASE'], '-qAt', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    lock.stdin.write(f"BEGIN; SELECT tenant FROM commerce_settings WHERE tenant='{tenant}' FOR UPDATE; SELECT pg_sleep(4); COMMIT;\n")
    lock.stdin.close()
    assert lock.stdout.readline().strip() == tenant
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        write = pool.submit(call, limited[2], '/api/merchant/commerce', basis, merchant, 'PUT')
        for _ in range(20):
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT data,revision FROM commerce_settings%');") == 't':
                break
            time.sleep(.03)
        else:
            raise AssertionError('Blocked application transaction was not observed')
        started = time.perf_counter()
        call(limited[2], '/store-api/context', expected=503)
        assert time.perf_counter() - started < 2.5
        write.result(timeout=10)
    lock.wait(timeout=5)
    assert call(limited[2], read)['product']['tax_rate'] == 23
    print('PASS exhausted pool returns bounded HTTP 503 and recovers after the blocked transaction')
finally:
    close(limited)

if env.get('PERFORMANCE_BASELINE_BIN'):
    workloads = [
        ('storefront-list', '/store-api/product', {}, {}),
        ('storefront-detail', read, None, {}),
        ('admin-catalog', '/api/search/product', {}, merchant),
        ('mcp-catalog', '/mcp', {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
            'params': {'name': 'catalog.search', 'arguments': {}}}, {}),
    ]
    # Log query counts separately from latency so tracing does not distort the timed runs.
    reports = {}
    fingerprints = {}
    for label, binary in [('before', env['PERFORMANCE_BASELINE_BIN']), ('after', str(ROOT / 'target/debug/vendune'))]:
        server = start('counts-' + label, binary=binary)
        counts = {}
        try:
            for name, path, body, headers in workloads:
                value = call(server[2], path, body, headers)
                digest = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
                if label == 'before': fingerprints[name] = digest
                else: assert fingerprints[name] == digest, 'Business response changed: ' + name
                offset = server[3].stat().st_size
                call(server[2], path, body, headers)
                text = server[3].read_bytes()[offset:].decode()
                counts[name] = sum('sqlx::query' in line and 'channel_metrics' not in line for line in text.splitlines())
        finally:
            close(server)
        server = start('latency-' + label, {'RUST_LOG': 'off'}, binary=binary)
        measured = {}
        try:
            for name, path, body, headers in workloads:
                for _ in range(16):
                    call(server[2], path, body, headers)
                rounds = []
                for _ in range(3):
                    def one(_):
                        started = time.perf_counter()
                        value = call(server[2], path, body, headers)
                        data = value['result']['structuredContent'] if name == 'mcp-catalog' else value
                        assert (data['product']['tax_rate'] == 23 if name == 'storefront-detail' else len(data['elements']) == 6)
                        return (time.perf_counter() - started) * 1000
                    started = time.perf_counter()
                    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
                        samples = sorted(pool.map(one, range(300)))
                    seconds = time.perf_counter() - started
                    rounds.append({'requests': len(samples), 'seconds': seconds, 'achievedRps': len(samples) / seconds,
                        'p50Ms': samples[math.ceil(len(samples) * .5) - 1], 'p95Ms': samples[math.ceil(len(samples) * .95) - 1],
                        'samplesMs': samples})
                measured[name] = {'sqlStatements': counts[name], 'rounds': rounds}
        finally:
            close(server)
        reports[label] = {'binarySha256': hashlib.sha256(Path(binary).read_bytes()).hexdigest(), 'workloads': measured}
    source = hashlib.sha256()
    for path in sorted([*ROOT.joinpath('src').rglob('*.rs'), *ROOT.joinpath('src').rglob('*.sql'), *ROOT.joinpath('migrations').glob('*.sql'), ROOT/'Cargo.toml', ROOT/'Cargo.lock']):
        source.update(str(path.relative_to(ROOT)).encode());source.update(path.read_bytes())
    report = {'environment': 'localhost, debug Rust, PostgreSQL Docker, six products, 16 clients, closed loop, three 300-request rounds per workload',
        'host': list(os.uname()), 'postgresql': sql('SHOW server_version;'), 'processRole': 'http',
        'afterSourceTreeSha256': source.hexdigest(),
        'baselineSourceCommit': env.get('PERFORMANCE_BASELINE_REF'), 'responseFingerprints': fingerprints,
        'sourceCommitAtMeasurement': subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
        'workingTreeChanged': bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip()),
        'limits': 'Warm local comparison; no Shopware baseline, large catalog, fleet, saturation, cold DB or production capacity claim',
        'errors': 0, 'readCacheRegression': 'passed', 'reports': reports}
    (ROOT / 'artifacts/read-performance-comparison.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({label: {name: {'sqlStatements': data['sqlStatements'],
        'p95Ms': [round(r['p95Ms'], 2) for r in data['rounds']], 'rps': [round(r['achievedRps']) for r in data['rounds']]}
        for name, data in v['workloads'].items()} for label, v in reports.items()}, indent=2))
