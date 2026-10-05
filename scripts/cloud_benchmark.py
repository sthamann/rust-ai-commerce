#!/usr/bin/env python3
"""Bounded private-cloud HTTP load using the existing validated benchmark sampler.

Creates fresh synthetic tenants only. PostgreSQL stays private, signup stays off,
and no customer credentials or paid providers are used. Logs contain aggregates,
never connection strings. Catalog fixtures are not full SaaS provisioning tests.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import threading
import uuid

import psycopg
from psycopg.types.json import Jsonb
from benchmark import call, sample

ROOT = pathlib.Path(__file__).resolve().parents[1]


def prepare(db, cases):
    settings = json.loads((ROOT / 'fixtures/demo-settings.json').read_text())
    prefix = 'nfbench-' + uuid.uuid4().hex[:10]
    fixtures = []
    for label, shops, products in cases:
        tenants = [f'{prefix}-{label}-{i}' for i in range(shops)]
        with db.connection.transaction():
            db.executemany('INSERT INTO tenants(id,name) VALUES(%s,%s)',
                           [(t, 'Synthetic performance fixture') for t in tenants])
            db.executemany('INSERT INTO commerce_settings(tenant,data) VALUES(%s,%s)',
                           [(t, Jsonb(settings)) for t in tenants])
            db.executemany('INSERT INTO experiences(tenant,data) VALUES(%s,%s)',
                           [(t, Jsonb({'mode': 'balanced', 'headline': 'Synthetic fixture'})) for t in tenants])
            db.execute("""INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock)
                SELECT tenant,'sku-'||lpad(i::text,7,'0'),'Product '||i,'Benchmark',
                'Synthetic cloud benchmark catalog',24.9,19,100000
                FROM unnest(%s::text[]) tenant CROSS JOIN generate_series(1,%s) i""",
                       (tenants, products))
            db.execute("""INSERT INTO product_translations(tenant,product_id,language_id,name,description)
                SELECT tenant,id,'11111111111111111111111111111111','Artikel '||id,
                'Synthetischer Benchmarkartikel' FROM products WHERE tenant=ANY(%s)""", (tenants,))
        actual = db.execute('SELECT count(*) FROM products WHERE tenant=ANY(%s)', (tenants,)).fetchone()[0]
        assert actual == shops * products, (label, actual)
        fixtures.append({'label': label, 'shops': shops, 'productsPerShop': products, 'tenants': tenants})
        print('FIXTURE', json.dumps({'label': label, 'shops': shops, 'products': actual}), flush=True)
    db.execute('ANALYZE products')
    db.execute('ANALYZE product_translations')
    return fixtures


def database_state(db):
    settings = dict(db.execute("""SELECT name,setting FROM pg_settings WHERE name IN
        ('fsync','synchronous_commit','full_page_writes','shared_buffers','max_connections')""").fetchall())
    row = db.execute("""SELECT pg_database_size(current_database()),numbackends,xact_commit,
        xact_rollback,blks_read,blks_hit,temp_bytes,deadlocks FROM pg_stat_database
        WHERE datname=current_database()""").fetchone()
    return {'settings': settings, 'stats': dict(zip(
        ['databaseBytes','connections','commits','rollbacks','blocksRead','blocksHit','tempBytes','deadlocks'], row))}


def measure(args, db, fixture):
    tenants = fixture['tenants']
    size = fixture['productsPerShop']
    counter = iter(range(10**9))
    lock = threading.Lock()

    def scope():
        with lock:
            i = next(counter)
        return {'x-tenant': tenants[i % len(tenants)], 'x-commerce-locale': 'de-DE'}

    def catalog(_):
        data = call(args.base, '/store-api/product', {'limit': 50}, scope())
        assert len(data['elements']) == min(50, size) and data['hasMore'] == (size > 50)
        assert data['elements'][0]['name'].startswith('Artikel sku-')
        assert data['elements'][0]['calculated_price']['unitPrice'] == 24.9

    def detail(_):
        data = call(args.base, '/store-api/product/sku-0000001', {}, scope())
        assert data['product']['id'] == 'sku-0000001'
        assert data['calculatedPrices'][0]['price']['unitPrice'] == 24.9

    def search(_):
        needle = 'sku-' + str(min(999, size)).zfill(7)
        data = call(args.base, '/store-api/product', {'search': 'Artikel ' + needle, 'limit': 50}, scope())
        assert len(data['elements']) == 1 and data['elements'][0]['id'] == needle

    def broad(_):
        data = call(args.base, '/store-api/product', {'search': 'Artikel', 'limit': 50}, scope())
        assert len(data['elements']) == 50 and data['hasMore']

    operations = [('catalog', catalog), ('detail', detail), ('selective-search', search), ('broad-search', broad)]
    results = []
    for name, operation in operations:
        for concurrency in args.concurrency:
            before = database_state(db)
            for r in range(1, args.rounds + 1):
                result = sample(fixture['label'] + '/' + name, operation, concurrency, args.requests, r)
                result.pop('latenciesMs')
                result['failures'] = result['failures'][:5]
                result.update({'shops': len(tenants), 'productsPerShop': size})
                results.append(result)
                print('RESULT_JSON', json.dumps(result, separators=(',', ':')), flush=True)
            print('DATABASE_JSON', json.dumps({'scenario': fixture['label'] + '/' + name,
                  'concurrency': concurrency, 'before': before, 'after': database_state(db)}), flush=True)
    # A bounded fixed-arrival sample exposes queue growth rather than hiding it in closed-loop throughput.
    if args.arrival_rate:
        result = sample(fixture['label'] + '/catalog-fixed-arrivals', catalog, max(args.concurrency),
                        args.requests, 1, args.arrival_rate)
        result.pop('latenciesMs')
        result['failures'] = result['failures'][:5]
        result.update({'shops': len(tenants), 'productsPerShop': size})
        results.append(result)
        print('RESULT_JSON', json.dumps(result, separators=(',', ':')), flush=True)
    return results


def cart_check(args, db, fixture):
    headers = {'x-tenant': fixture['tenants'][0], 'x-commerce-locale': 'de-DE'}
    cart = call(args.base, '/store-api/checkout/cart', {'session': uuid.uuid4().hex}, headers)
    headers = {**headers, 'sw-context-token': cart['token']}
    call(args.base, '/store-api/checkout/cart/line-item', {'items': [
        {'referencedId': 'sku-' + str(i).zfill(7), 'quantity': 1} for i in range(1, 21)]}, headers)

    def quote(_):
        data = call(args.base, '/store-api/checkout/cart', headers=headers)
        assert len(data['lineItems']) == 20 and data['price']['totalPrice'] == 498

    results = []
    for c in args.concurrency:
        result = sample('cart-20-lines', quote, c, args.requests, 1)
        result.pop('latenciesMs')
        result['failures'] = result['failures'][:5]
        results.append(result)
        print('RESULT_JSON', json.dumps(result, separators=(',', ':')), flush=True)
    order = call(args.base, '/store-api/checkout/order', {}, {**headers, 'Idempotency-Key': uuid.uuid4().hex})
    assert order['state'] == 'placed' and order['payment']['realMoneyCharged'] is False
    assert db.execute('SELECT count(*) FROM orders WHERE id=%s AND tenant=%s',
                      (order['id'], fixture['tenants'][0])).fetchone()[0] == 1
    print('CHECKOUT_PERSISTED simulated-provider, unique order committed', flush=True)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default=os.getenv('BASE_URL', 'http://vendune-core:8787'))
    parser.add_argument('--requests', type=int, default=300)
    parser.add_argument('--rounds', type=int, default=2)
    parser.add_argument('--concurrency', type=lambda s: [int(c) for c in s.split(',')], default=[1, 8, 32])
    parser.add_argument('--arrival-rate', type=float, default=100)
    parser.add_argument('--smoke', action='store_true')
    args = parser.parse_args()
    if not 64 <= args.requests <= 3000 or not 1 <= args.rounds <= 3:
        parser.error('Bounded run requires 64..3000 requests and 1..3 rounds')
    if not args.concurrency or any(c < 1 or c > 128 for c in args.concurrency):
        parser.error('Concurrency must be 1..128')
    if not 0 <= args.arrival_rate <= 1000:
        parser.error('Arrival rate must be 0..1000')
    if os.getenv('BENCHMARK_ENVIRONMENT') != 'vendune-northflank-test':
        raise SystemExit('Explicit BENCHMARK_ENVIRONMENT=vendune-northflank-test required')
    # Use the same linked connection URI as the service; never expose it in logs.
    try:
        connection = psycopg.connect(os.environ['DATABASE_URL'], autocommit=True, connect_timeout=15)
    except Exception:
        raise SystemExit('Database connection failed; inspect runtime secret linkage privately') from None
    with connection.cursor() as db:
        db.execute("SET statement_timeout='120s'")
        cases = [('smoke', 2, 100)] if args.smoke else [
            ('small', 1, 1000), ('large', 1, 100000), ('many', 100, 1000), ('thousand', 1000, 100)]
        initial = database_state(db)
        if initial['stats']['databaseBytes'] > 3 * 1024**3:
            raise SystemExit('Database already above 3 GiB; stop before adding fixtures')
        fixtures = prepare(db, cases)
        metadata = {'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'sourceCommit': os.getenv('BENCHMARK_SOURCE_COMMIT', 'unknown'),
                    'scriptSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
                    'environment': 'Northflank private network; service/PG each 0.5 shared vCPU, 1 GiB',
                    'transport': 'HTTP/1.1 fresh connection; complete JSON validation; warm caches',
                    'scope': 'Synthetic tenant catalog distribution; no SaaS signup, vector/LLM inference, external TLS/CDN or real payment load',
                    'fixturePrefix': fixtures[0]['tenants'][0].rsplit('-', 2)[0],
                    'fixtureShops': sum(f['shops'] for f in fixtures),
                    'initialDatabase': initial}
        print('METADATA_JSON', json.dumps(metadata, separators=(',', ':')), flush=True)
        results = []
        for fixture in fixtures:
            results.extend(measure(args, db, fixture))
        results.extend(cart_check(args, db, fixtures[0]))
        print('COMPLETE_JSON', json.dumps({'samples': len(results), 'requests': sum(r['requests'] for r in results),
              'errors': sum(r['errors'] for r in results), 'finalDatabase': database_state(db)}), flush=True)


if __name__ == '__main__':
    main()
