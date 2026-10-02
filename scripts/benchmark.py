#!/usr/bin/env python3
"""Reproducible local HTTP + PostgreSQL benchmark, with response validation.

Only --prepare writes fixtures; it requires an explicitly named isolated database.
Timings include the HTTP round trip, complete response read and JSON validation.
No LLM or external payment provider is contacted. This is a closed-loop workload.
"""
import argparse
import concurrent.futures
import datetime
import http.client
import hashlib
import json
import math
import os
import pathlib
import platform
import statistics
import subprocess
import threading
import time
import uuid
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
LOCAL = threading.local()


def call(base, path, body=None, headers=None, method=None):
    endpoint = urlsplit(base)
    if not hasattr(LOCAL, 'connection'):
        cls = http.client.HTTPSConnection if endpoint.scheme == 'https' else http.client.HTTPConnection
        LOCAL.connection = cls(endpoint.hostname, endpoint.port, timeout=10)
    payload = None if body is None else json.dumps(body, separators=(',', ':')).encode()
    LOCAL.connection.request(method or ('GET' if body is None else 'POST'), path, payload,
                             {'Content-Type': 'application/json', 'Connection': 'close', **(headers or {})})
    response = LOCAL.connection.getresponse()
    value = json.loads(response.read())
    LOCAL.connection.close()
    if response.status != 200:
        raise RuntimeError(f'{path}: HTTP {response.status}: {value}')
    return value


def prepare(base, container, fixture_file):
    # Fixtures are never loaded into a default or existing development database.
    if container != 'rust-commerce-performance-postgres-1' or urlsplit(base).port != 8791:
        raise ValueError('Preparation requires the isolated rust-commerce-performance database and port 8791')
    fixtures = {}
    for label, size in [('small', 6), ('large', 1000)]:
        tenant = 'bench-' + uuid.uuid4().hex[:12]
        user = call(base, '/api/auth/register', {
            'email': uuid.uuid4().hex + '@example.test', 'name': 'Synthetic benchmark owner',
            'password': uuid.uuid4().hex + '!Aa1', 'workspaceId': tenant,
            'workspaceName': 'Synthetic benchmark ' + label,
        })
        fixtures[label] = {'tenant': tenant, 'products': size, 'token': user['token']}
        # All identifiers are generated here, never interpolated from external input.
        sql = f"""
        DELETE FROM product_translations WHERE tenant='{tenant}';
        DELETE FROM products WHERE tenant='{tenant}';
        INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock)
        SELECT '{tenant}', 'sku-'||lpad(i::text,4,'0'), 'Product '||i,
               'Benchmark', 'Synthetic catalog fixture', 24.9, 19, 100000
        FROM generate_series(1,{size}) i;
        INSERT INTO product_translations(tenant,product_id,language_id,name,description)
        SELECT tenant,id,'11111111111111111111111111111111',
               'Artikel '||id, 'Synthetischer Benchmarkartikel'
        FROM products WHERE tenant='{tenant}';
        ANALYZE products; ANALYZE product_translations;
        """
        subprocess.run(['docker', 'exec', '-i', container, 'psql', '-U', 'commerce', '-d', 'commerce',
                        '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, check=True, capture_output=True)
    fixture_file.parent.mkdir(parents=True, exist_ok=True)
    fixture_file.write_text(json.dumps(fixtures))
    fixture_file.chmod(0o600)
    print('Prepared isolated synthetic catalogs: 6 and 1,000 products')


def percentile(values, fraction):
    return round(sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)], 3)


def sample(name, operation, concurrency, requests, round_number):
    # An actual pool warm-up uses the same connections and endpoints as measurement.
    barrier = threading.Barrier(concurrency)
    def warm(_):
        barrier.wait(timeout=60)
        operation(None)
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        list(pool.map(warm, range(concurrency)))
        def timed(i):
            started = time.perf_counter_ns()
            try:
                operation(i)
                error = None
            except Exception as exc:
                error = type(exc).__name__ + ': ' + str(exc)
                LOCAL.connection.close()
                del LOCAL.connection
            return ((time.perf_counter_ns() - started) / 1e6, error)
        started = time.perf_counter()
        outcomes = list(pool.map(timed, range(requests)))
        elapsed = time.perf_counter() - started
    durations = [duration for duration, error in outcomes if error is None]
    failures = [{'request': i, 'elapsedMs': duration, 'error': error}
                for i, (duration, error) in enumerate(outcomes) if error is not None]
    if not durations:
        raise RuntimeError('All measured requests failed: ' + str(failures[:1]))
    result = {'scenario': name, 'round': round_number, 'concurrency': concurrency,
              'requests': requests, 'errors': len(failures), 'failures': failures,
              'seconds': round(elapsed, 4),
              'requestsPerSecond': round(len(durations) / elapsed, 1),
              'p50Ms': percentile(durations, .5), 'p95Ms': percentile(durations, .95),
              'p99Ms': percentile(durations, .99), 'latenciesMs': durations}
    print(name, 'c=' + str(concurrency), 'round=' + str(round_number),
          result['requestsPerSecond'], 'req/s', 'p95=', result['p95Ms'],
          'errors=', len(failures), flush=True)
    return result


def benchmark(args):
    source_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    source_diff = args.source_diff.read_text() if args.source_diff else subprocess.check_output(['git', 'diff', '--', 'src'], cwd=ROOT, text=True)
    binary_hash = hashlib.sha256(args.binary.read_bytes()).hexdigest()
    fixtures = json.loads(args.fixture.read_text())
    results = []
    for label in ['small', 'large']:
        f = fixtures[label]
        headers = {'x-tenant': f['tenant'], 'x-commerce-locale': 'de-DE'}
        def catalog(_):
            data = call(args.base, '/store-api/product', headers=headers, method='POST')
            assert len(data['elements']) == f['products'] and data['total'] == f['products']
            assert data['elements'][0]['name'].startswith('Artikel ')
            assert data['elements'][0]['calculated_price']['unitPrice'] == 24.9
        for concurrency in [1, 16, 64]:
            for round_number in range(1, args.rounds + 1):
                results.append(sample('catalog-' + str(f['products']), catalog, concurrency,
                                      args.requests, round_number))
    f = fixtures['large']
    headers = {'x-tenant': f['tenant'], 'x-commerce-locale': 'de-DE'}
    cart = call(args.base, '/store-api/checkout/cart', {'session': uuid.uuid4().hex}, headers)
    cart_headers = {**headers, 'sw-context-token': cart['token']}
    call(args.base, '/store-api/checkout/cart/line-item',
         {'items': [{'referencedId': f'sku-{i:04d}', 'quantity': 1} for i in range(1, 21)]}, cart_headers)
    def quote(_):
        data = call(args.base, '/store-api/checkout/cart', headers=cart_headers)
        assert len(data['lineItems']) == 20 and data['price']['totalPrice'] == 498
    for concurrency in [1, 16]:
        for round_number in range(1, args.rounds + 1):
            results.append(sample('cart-20-lines-in-1000-catalog', quote, concurrency,
                                  args.requests, round_number))
    # Fresh carts and keys: measured requests must create orders, never replay them.
    order_ids = set()
    lock = threading.Lock()
    for round_number in range(1, args.rounds + 1):
        count = max(64, args.requests // 2)
        carts = []
        for i in range(count + 16):
            c = call(args.base, '/store-api/checkout/cart', {'session': uuid.uuid4().hex}, headers)
            h = {**headers, 'sw-context-token': c['token'], 'Idempotency-Key': uuid.uuid4().hex}
            call(args.base, '/store-api/checkout/cart/line-item',
                 {'items': [{'referencedId': f'sku-{(i % 100) + 1:04d}', 'quantity': 1}]}, h)
            carts.append(h)
        warm_index = iter(range(count, count + 16))
        def checkout(i):
            with lock:
                index = next(warm_index) if i is None else i
            data = call(args.base, '/store-api/checkout/order', {}, carts[index])
            assert data['state'] == 'placed' and data['payment']['provider'] == 'simulated'
            assert data['payment']['realMoneyCharged'] is False
            assert data['cart']['price']['totalPrice'] == 24.9
            with lock:
                assert data['id'] not in order_ids
                order_ids.add(data['id'])
        results.append(sample('durable-checkout-in-1000-catalog', checkout, 16, count, round_number))
    # The merchant list intentionally returns only its latest 100 orders.
    # Check every measured ID in PostgreSQL, rather than misreading that page cap.
    quote_sql = lambda value: "'" + value.replace("'", "''") + "'"
    sql = 'SELECT id FROM orders WHERE tenant=' + quote_sql(f['tenant']) + ' AND id IN (' + ','.join(quote_sql(i) for i in order_ids) + ')'
    persisted = subprocess.check_output(['docker', 'exec', args.database_container,
        'psql', '-U', 'commerce', '-d', 'commerce', '-At', '-c', sql], text=True).splitlines()
    assert order_ids.issubset(set(persisted)), 'Measured orders must be persisted'
    groups = {}
    for result in results:
        key = result['scenario'] + '/c' + str(result['concurrency'])
        groups.setdefault(key, []).append(result)
    summaries = []
    for key, rounds in groups.items():
        summaries.append({'key': key, 'scenario': rounds[0]['scenario'],
                          'concurrency': rounds[0]['concurrency'], 'rounds': len(rounds),
                          'requests': sum(r['requests'] for r in rounds),
                          'errors': sum(r['errors'] for r in rounds),
                          'medianRequestsPerSecond': round(statistics.median(r['requestsPerSecond'] for r in rounds), 1),
                          'medianP50Ms': statistics.median(r['p50Ms'] for r in rounds),
                          'medianP95Ms': statistics.median(r['p95Ms'] for r in rounds),
                          'medianP99Ms': statistics.median(r['p99Ms'] for r in rounds)})
    report = {'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'sourceCommit': source_commit, 'sourceDiff': source_diff,
              'binarySha256': binary_hash,
              'benchmarkScriptSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
              'environment': {'os': platform.platform(), 'cpu': subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string'], text=True).strip() if platform.system() == 'Darwin' else platform.processor(),
                              'memoryBytes': int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], text=True)) if platform.system() == 'Darwin' else None,
                              'build': 'cargo build --release --locked', 'database': 'PostgreSQL 16 / Docker / AGE + pgvector',
                              'rust': subprocess.check_output(['rustc', '--version'], text=True).strip(),
                              'transport': 'localhost HTTP/1.1; fresh connection per request; catalog POST has no body', 'client': 'Python ' + platform.python_version() + ' stdlib threads; same host as server',
                              'warmup': 'one validated request per client before each round; OS/database caches warm',
                              'loadModel': 'closed loop; clients issue next request after validating previous response'},
              'scope': 'Synthetic local catalogs. Not production capacity, external network latency, LLM speed or a Shopware comparison.',
              'persistedUniqueOrdersIncludingWarmup': len(order_ids), 'summaries': summaries, 'samples': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print('Saved', args.output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default=os.getenv('BASE_URL', 'http://127.0.0.1:8791'))
    parser.add_argument('--fixture', type=pathlib.Path, default=ROOT / '.run/benchmark-fixture.json')
    parser.add_argument('--prepare', metavar='ISOLATED_CONTAINER')
    parser.add_argument('--requests', type=int, default=300)
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / '.run/benchmark.json')
    parser.add_argument('--binary', type=pathlib.Path, default=ROOT / 'target/release/rust-ai-commerce')
    parser.add_argument('--source-diff', type=pathlib.Path, help='Diff corresponding to the measured binary, captured before building')
    parser.add_argument('--database-container', default='rust-commerce-performance-postgres-1')
    args = parser.parse_args()
    if args.prepare:
        prepare(args.base, args.prepare, args.fixture)
    else:
        if args.requests < 64 or args.rounds < 1:
            parser.error('Use at least 64 requests and one round')
        benchmark(args)
