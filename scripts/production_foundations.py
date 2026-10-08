#!/usr/bin/env python3
"""Strict non-owner PostgreSQL runtime, pool isolation, inventory and two-replica invalidation regressions."""
import concurrent.futures
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from testing.runtime import ROOT, serve, stop
from testing.database import psql
from testing.pooler import Pooler
from security import core_hardening
from testing import inventory_batch

env = dict(os.environ)
role = 'runtime_' + uuid.uuid4().hex[:12]
password = uuid.uuid4().hex
url = urllib.parse.urlsplit(env['DATABASE_URL'])
owner = urllib.parse.unquote(url.username or 'commerce')
database = env['TEST_DATABASE']
processes = []
pooler = None

def sql(text, fail=False):
    result = subprocess.run(psql(env['TEST_DB_CONTAINER'],owner,database,'-qAt','-v','ON_ERROR_STOP=1'), input=text, text=True, capture_output=True)
    if fail:
        assert result.returncode != 0, 'Unsafe SQL unexpectedly succeeded'
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()

def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def call(base, path, body=None, h=None, method=None, expected=200):
    request = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type':'application/json', **(h or {})}, method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(request, timeout=30) as r:
            code, value = r.status, json.load(r)
    except urllib.error.HTTPError as e:
        code, value = e.code, json.load(e)
    assert code == expected, (path, code, value, expected)
    return value

def scoped(t, statement):
    # Trusted test login sets no system scope; deliberately omit tenant WHERE clauses.
    return sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('rac.tenant','{t}',true),set_config('rac.system','off',true); {statement}; COMMIT;")

try:
    sql(f"CREATE ROLE {role} LOGIN PASSWORD '{password}' NOSUPERUSER NOBYPASSRLS NOINHERIT; GRANT CONNECT,CREATE ON DATABASE {database} TO {role}; GRANT USAGE,CREATE ON SCHEMA public TO {role}; GRANT SELECT,INSERT,UPDATE,DELETE,REFERENCES ON ALL TABLES IN SCHEMA public TO {role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO {role};")
    # Existing dynamic app tables use their own FORCE-RLS policy and need a schema owner for upgrades.
    sql(f"DO $$ DECLARE t record; BEGIN FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname ~ '^app_[a-f0-9]{{16}}([a-f0-9]{{8}})?_' LOOP EXECUTE format('ALTER TABLE public.%I OWNER TO {role}',t.relname); END LOOP; END $$;")
    # Same role privileges as documented production runtime: no core TRUNCATE or owner membership.
    runtime_url = urllib.parse.urlunsplit(url._replace(netloc=f'{role}:{password}@{url.hostname}:{url.port}'))
    env.update(DATABASE_RUNTIME_URL=runtime_url, DB_RLS_REQUIRED='true', DB_POOL_MAX='2', DB_POOL_MIN='0',
        PROCESS_ROLE='http', BOOTSTRAP_MODE='serve', TENANT_AI_DAILY_QUOTA='3')
    if env.get('TEST_TRANSACTION_POOLING')=='1':
        pooler=Pooler(runtime_url)
        env.update(DATABASE_RUNTIME_URL=pooler.url,DATABASE_LISTENER_URL=runtime_url,DB_POOLER_MODE='transaction')
    # Strict startup must reject a role that has a whole-table RLS bypass operation.
    sql(f'GRANT TRUNCATE ON products TO {role};')
    with (ROOT/'artifacts/production-unsafe-role.log').open('w') as bad_log:
        rejected = subprocess.Popen([str(ROOT/'target/debug/vendune')], cwd=ROOT,
            env={**env,'BIND_ADDR':f'127.0.0.1:{port()}'}, stdout=bad_log, stderr=bad_log)
        assert rejected.wait(timeout=20) != 0, 'Unsafe runtime role was admitted'
    assert 'Runtime role must not own core tables' in (ROOT/'artifacts/production-unsafe-role.log').read_text(), 'Startup failed before role audit'
    sql(f'REVOKE TRUNCATE ON products FROM {role};')
    print('PASS strict startup rejects a runtime with core TRUNCATE privilege')
    core_hardening.before_workers(sql)
    bases = []
    for index in range(2):
        base = f'http://127.0.0.1:{port()}'
        child = {**env, 'PROCESS_ROLE':'all' if index == 0 else 'http', 'BASE_URL':base, 'BIND_ADDR':base.removeprefix('http://')}
        log = (ROOT / 'artifacts' / f'production-replica-{index}.log').open('w')
        processes.append((serve(child, base, log), log))
        bases.append(base)
    one, two = bases
    h = {'x-tenant':'atelier', 'Authorization':'Bearer '+env['MERCHANT_TOKEN']}
    assert scoped('', 'SELECT count(*) FROM products').splitlines()[-1] == '0'
    assert scoped('atelier', "SELECT count(DISTINCT tenant) FROM products").splitlines()[-1] == '1'
    assert scoped('atelier', "SELECT count(*) FROM orders WHERE tenant='workshop'").splitlines()[-1] == '0'
    assert scoped('atelier', "UPDATE products SET stock=999 WHERE tenant='workshop' RETURNING id").splitlines()[-1] == 'atelier|off'
    # Forged same-ID write, not a SELECT that could merely hide a foreign row.
    sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('rac.tenant','atelier',true); INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock) VALUES('workshop','rls-forged','forged','test','test',1,19,1);", fail=True)
    sql("INSERT INTO currency_price_jobs(tenant,id,data,state) VALUES('atelier','currency-own','{}','completed'),('workshop','currency-foreign','{}','completed');")
    assert scoped('atelier', 'SELECT count(*) FROM currency_price_jobs').splitlines()[-1] == '1'
    assert scoped('atelier', "DELETE FROM currency_price_jobs WHERE tenant='workshop' RETURNING id").splitlines()[-1] == 'atelier|off'
    sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('rac.tenant','atelier',true); INSERT INTO currency_price_jobs(tenant,id,data) VALUES('workshop','forged','{{}}');",fail=True)
    print('PASS currency job FORCE-RLS hides foreign jobs and rejects foreign delete and forged insert')
    # Exercise a real checkpoint across worker shutdown/restart, not an in-memory queue.
    sql("INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock) SELECT 'atelier','fx_bulk_'||lpad(n::text,3,'0'),'FX batch fixture','test','Synthetic bulk currency fixture',2.14,19,10 FROM generate_series(1,205)n;")
    config = call(one, '/api/merchant/commerce', h=h)
    config['data']['currencies']['definitions'].append({'code':'USD','scale':2,'rate':'1.25','strategy':'fixed'})
    config['data']['currencies']['enabled'].append('USD')
    saved = call(one, '/api/merchant/commerce', {'revision':config['revision'],'data':config['data']},h,'PUT')
    job = call(one, '/api/merchant/currencies/price-jobs', {'revision':saved['revision'],'currency':'USD'},h)
    # A later product sorts inside the ID ceiling; its creation time must exclude it.
    sql("INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock) VALUES('atelier','fx_bulk_999','Future fixture','test','Created after job snapshot',2.14,19,10);")
    for _ in range(200):
        state = call(one, '/api/merchant/currencies/price-jobs/'+job['id'],h=h)
        if state['processed'] >= 100: break
        time.sleep(.03)
    assert state['state']=='queued' and state['processed']==100,state
    stop(processes[0][0])
    assert sql("SELECT count(*) FROM resource_leases WHERE tenant='__runtime' AND class='db-connections' AND slots=4")=='1', 'Graceful shutdown retained a fleet connection reservation'
    resumed = {**env,'PROCESS_ROLE':'all','BASE_URL':one,'BIND_ADDR':one.removeprefix('http://')}
    processes[0] = (serve(resumed,one,processes[0][1]),processes[0][1])
    assert sql("SELECT count(*) FROM resource_leases WHERE tenant='__runtime' AND class='db-connections' AND slots=4")=='2', 'Restart lost the shared fleet budget'
    for _ in range(200):
        state = call(one, '/api/merchant/currencies/price-jobs/'+job['id'],h=h)
        if state['state']=='completed': break
        time.sleep(.03)
    assert state['state']=='completed' and state['processed']>=205,state
    assert sql("SELECT count(*) FROM products WHERE tenant='atelier' AND id LIKE 'fx_bulk_%' AND id<>'fx_bulk_999' AND extra->'currencyPrices'->'USD'->>'price'='2.68';")=='205'
    assert sql("SELECT extra->'currencyPrices'->'USD' IS NULL FROM products WHERE tenant='atelier' AND id='fx_bulk_999';")=='t'
    print('PASS fixed-price worker resumes a committed 100-product checkpoint after restart; 205 midpoint prices are exact and post-snapshot products excluded')
    sql("INSERT INTO knowledge_hypotheses(tenant,id,kind,evidence,state) VALUES('atelier','currency-recommendation','association','{\"left\":\"mug\",\"right\":\"fx_bulk_001\"}','published');")
    rec = call(one, '/store-api/intelligence/recommendations/mug', h={'x-tenant':'atelier','x-commerce-currency':'USD'})
    assert rec['currencyContext']['code']=='USD' and len(rec['elements'])==1,rec
    assert rec['elements'][0]['price']==2.68 and rec['elements'][0]['currency']=='USD',rec
    channel = {'name':{'en':'Restricted currency recommendations'},'kind':'storefront','active':True,'locales':['en-GB'],'productIds':['mug'],'navigationCategoryId':None}
    call(one, '/api/automation/channels/fx_restricted', {'revision':0,'data':channel},h,'PUT')
    rec = call(one, '/store-api/intelligence/recommendations/mug', h={'x-tenant':'atelier','x-commerce-currency':'USD','sw-sales-channel-id':'fx_restricted'})
    assert rec['elements']==[],rec
    print('PASS approved recommendations use shared currency prices and cannot leak products hidden by the sales channel')
    print('PASS core SQL denies unknown scope, foreign reads/writes and forged insertion without WHERE protection')
    def read(n):
        t = 'atelier' if n % 2 else 'workshop'
        value = call(bases[n % 2], '/store-api/product/mug', h={'x-tenant':t,'x-rac-tenant':'foreign','x-rac-role':'owner'})
        assert value['product']['id'] == 'mug'
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(read, range(40)))
    print('PASS two safe-runtime replicas reuse small pools without losing tenant scope')
    # Proof that personal foreign tenant checks still hold under the RLS runtime.
    sessions = []
    for label in ['alpha','beta']:
        t = label + '-' + uuid.uuid4().hex[:8]
        s = call(one, '/api/auth/register', {'name':label,'email':t+'@example.test','password':'Synthetic-strong-password!','workspaceId':t})
        sessions.append(s)
    call(two, '/api/search/product', {}, {'Authorization':'Bearer '+sessions[0]['token'],'x-tenant':sessions[1]['workspace']}, expected=403)
    print('PASS registration uses admitted provisioning scope; merchant cannot inherit another shop')
    # Platform grants cannot be self-issued. Quotas are optimistic, audited operator changes.
    user = sessions[0]['user']['id']
    operator = {'Authorization':'Bearer '+sessions[0]['token']}
    target = sessions[1]['workspace']
    call(one, f'/api/platform/shops/{target}/quotas', h=operator, expected=403)
    sql(f"INSERT INTO platform_operators(user_id) VALUES('{user}');")
    quota = call(one, f'/api/platform/shops/{target}/quotas', h=operator)
    updated = call(one, f'/api/platform/shops/{target}/quotas', {'dailyAi':2,'revision':quota['revision']}, operator, 'PUT')
    assert updated['dailyAi'] == 2 and updated['revision'] == 2
    call(two, f'/api/platform/shops/{target}/quotas', {'dailyAi':3,'revision':1}, operator, 'PUT', 409)
    call(two, f'/api/platform/shops/{target}/quotas', {'dailyAi':0,'revision':2}, operator, 'PUT', 400)
    print('PASS quota administration requires platform grant, rejects stale revisions, and records bounded limits')
    # A corrupted/editable order snapshot cannot inflate a stock release.
    shopper = {'x-tenant':sessions[0]['workspace']}
    stock = call(one, '/store-api/product/lamp', h=shopper)['product']['stock']
    cart = call(one, '/store-api/checkout/cart', {'session':uuid.uuid4().hex}, shopper)
    shopper['sw-context-token'] = cart['token']
    call(one, '/store-api/checkout/cart/line-item', {'items':[{'referencedId':'lamp','quantity':2}]}, shopper)
    order = call(one, '/store-api/checkout/order', {}, {**shopper,'Idempotency-Key':uuid.uuid4().hex})
    oid = order['id']
    sql(f"UPDATE orders SET data=jsonb_set(data,'{{cart,lineItems,0,quantity}}','999') WHERE tenant='{sessions[0]['workspace']}' AND id='{oid}';")
    owner_h = {'x-tenant':sessions[0]['workspace'],'Authorization':'Bearer '+sessions[0]['token'],'Idempotency-Key':uuid.uuid4().hex}
    for _ in range(100):
        if any(j['flow']=='default_order_received' and j['state']=='completed' for j in call(one, '/api/automation/executions', h=owner_h)['jobs']): break
        time.sleep(.05)
    current = call(one, f'/api/merchant/orders/{oid}', h=owner_h)
    body = {'kind':'order','state':'cancelled','revision':current['revision']}
    call(one, f'/api/merchant/orders/{oid}/transition', body, owner_h)
    call(two, f'/api/merchant/orders/{oid}/transition', body, owner_h)
    assert call(two, '/store-api/product/lamp', h=shopper)['product']['stock'] == stock
    assert scoped(sessions[0]['workspace'], f"SELECT quantity,released_at IS NOT NULL FROM order_inventory_reservations WHERE order_id='{oid}'").splitlines()[-1] == '2|t'
    print('PASS allocations ignore corrupted snapshot quantity and release once across replicas')
    inventory_batch.verify(call, bases, owner_h, sessions[0]['workspace'])
    # Existing real SQL suites are repeated with the strict runtime, not only privileged DB fixtures.
    for suite in ['checkout_review', 'merchant_operations', 'tenant_isolation']:
        subprocess.run(['python3', f'scripts/{suite}.py'], cwd=ROOT, env={**env,'BASE_URL':one}, check=True)
    for base in bases:
        call(base, '/api/merchant/commerce', h=h)
    before = [call(base, '/api/runtime', h=h)['performance']['reads']['eventInvalidations'] for base in bases]
    sql("UPDATE commerce_settings SET revision=revision+1 WHERE tenant='atelier';")
    for _ in range(50):
        after = [call(base, '/api/runtime', h=h)['performance']['reads']['eventInvalidations'] for base in bases]
        if all(b > a for a,b in zip(before,after)): break
        time.sleep(.05)
    assert all(b > a for a,b in zip(before,after)), (before,after)
    rollback = after
    sql("BEGIN; UPDATE commerce_settings SET revision=revision+1 WHERE tenant='atelier'; ROLLBACK;")
    time.sleep(.2)
    assert [call(base, '/api/runtime', h=h)['performance']['reads']['eventInvalidations'] for base in bases] == rollback
    print('PASS committed outbox event invalidates both replicas; rollback emits no notification')
    # Requests fail before any provider traffic, yet admission attempts remain durable across replicas.
    ai_h = {'x-tenant':sessions[0]['workspace'],'Authorization':'Bearer '+sessions[0]['token']}
    stage = call(one, '/api/environments', {'name':'Quota fixture'}, ai_h)['id']
    for index in range(3):
        # Missing message is rejected by handler, after quota reservation, without provider calls.
        call(bases[index%2], '/store-api/product/lamp/questions' if index==2 else '/api/agent/chat', {}, {**ai_h,'x-tenant':stage if index==1 else sessions[0]['workspace']}, expected=400)
    call(two, '/api/agent/chat', {}, ai_h, expected=429)
    assert scoped(sessions[0]['workspace'], 'SELECT attempts FROM tenant_ai_usage').splitlines()[-1] == '3'
    print('PASS daily interactive AI quota is atomic and shared across replicas')
    core_hardening.verify(sql,call,bases,h)
finally:
    for process, log in processes:
        stop(process); log.close()
    if pooler:pooler.close()
    # Runtime owns dynamically created app tables only; DROP OWNED is restricted to this disposable DB.
    sql(f'DROP OWNED BY {role}; DROP ROLE {role};')
