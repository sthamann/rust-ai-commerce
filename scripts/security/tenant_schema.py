"""Database adversarial checks: reject cross-shop links even when API predicates are accidentally omitted."""
import hashlib
import os
import subprocess
from testing.database import psql


def sql(statement):
    result = subprocess.run(psql(os.environ['TEST_DB_CONTAINER'],'commerce',os.environ['TEST_DATABASE'],'-X','-q','-v','ON_ERROR_STOP=1','-At'), input='SET search_path=public;\n' + statement, text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def run(a, b, passed):
    # All values originate from synthetic local fixtures, never user input/real shops.
    ta, tb = a['tenant'], b['tenant']
    setup = ''
    for f in (a, b):
        t, oid = f['tenant'], f['order']['id']
        f['attempt'] = 'security-payment-' + oid
        f['job'] = 'security-job-' + oid
        f['probe_cart'] = 'security-cart-' + oid
        f['probe_order'] = 'security-order-' + oid
        f['free_cart'] = 'security-free-cart-' + oid
        f['host_app'] = 'host_app_' + oid
        f['host_alias'] = 'host_alias_' + oid
        setup += f"INSERT INTO app_packages(tenant,id,version,manifest,digest) VALUES('{t}','{f['host_app']}','1.0.0','{{}}','fixture');"
        setup += f"INSERT INTO hosted_frontends(alias,tenant,channel,origin,experience_alias,app_id) VALUES('{f['host_alias']}','{t}','default','https://fixture.test','{f['host_alias']}','{f['host_app']}');"
        setup += f"INSERT INTO carts(id,tenant,token,data) VALUES('{f['probe_cart']}','{t}','probe-token-{oid}','{{}}'),('{f['free_cart']}','{t}','free-token-{oid}','{{}}');"
        setup += f"INSERT INTO orders(id,tenant,cart_id,idempotency_key,fingerprint,data) VALUES('{f['probe_order']}','{t}','{f['probe_cart']}','probe-{oid}','fixture','{{}}');"
        f['event'] = sql(f"INSERT INTO outbox(tenant,kind,data) VALUES('{t}','security.fixture','{{}}') RETURNING id;").splitlines()[0]
        setup += f"INSERT INTO payment_attempts(id,tenant,order_id,provider,adapter_version,bn_code,amount_minor,currency,state) VALUES('{f['attempt']}','{t}','{oid}','manual','fixture','Vendune_Fixture_Only',100,'EUR','captured');"
        setup += f"INSERT INTO payment_jobs(id,tenant,attempt_id,operation,fingerprint,state) VALUES('{f['job']}','{t}','{f['attempt']}','reconcile','fixture','completed');"
    setup += f"INSERT INTO commerce_promotions(tenant,id,data) VALUES('{ta}','security-promo','{{}}');"
    setup += f"INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock) VALUES('{tb}','foreign-only','Foreign','fixture','fixture',1,19,1);"
    sql(setup)
    # Each row names its expected constraint and one valid/invalid statement. A negative
    # only counts if SQLSTATE 23503 is raised by that exact tenant constraint.
    cases = [
        ('hosted_frontends_app_fk', lambda f: f"UPDATE hosted_frontends SET app_id='{f['host_app']}' WHERE alias='{a['host_alias']}'"),
        ('orders_cart_scope', lambda f: f"INSERT INTO orders(id,tenant,cart_id,idempotency_key,fingerprint,data) VALUES('security-insert','{ta}','{f['free_cart']}','security-insert','fixture','{{}}')"),
        ('products_parent_scope', lambda f: f"UPDATE products SET parent_id='{('lamp' if f is a else 'foreign-only')}' WHERE tenant='{ta}' AND id='mug'"),
        ('promotion_uses_order_scope', lambda f: f"INSERT INTO promotion_uses(tenant,promotion,order_id) VALUES('{ta}','security-promo','{f['order']['id']}')"),
        ('payment_attempts_order_scope', lambda f: f"UPDATE payment_attempts SET order_id='{f['probe_order']}' WHERE id='{a['attempt']}'"),
        ('payment_jobs_attempt_scope', lambda f: f"UPDATE payment_jobs SET attempt_id='{f['attempt']}' WHERE id='{a['job']}'"),
        ('reservations_attempt_scope', lambda f: f"INSERT INTO inventory_reservations(tenant,attempt_id,product_id,quantity) VALUES('{ta}','{f['attempt']}','mug',1)"),
        ('order_activity_order_scope', lambda f: f"INSERT INTO order_activity(tenant,order_id,actor,kind,data) VALUES('{ta}','{f['order']['id']}','fixture','note','{{}}')"),
        ('receipts_order_scope', lambda f: f"UPDATE order_receipts SET order_id='{f['order']['id']}' WHERE tenant='{ta}' AND id='{a['receipt']['id']}'"),
        ('downloads_order_scope', lambda f: f"INSERT INTO order_downloads(tenant,order_id,asset_id) VALUES('{ta}','{f['order']['id']}','{a['asset']['id']}')"),
        ('transition_order_scope', lambda f: f"INSERT INTO order_transition_requests(tenant,request_key,order_id,fingerprint,response) VALUES('{ta}','security-key','{f['order']['id']}','fixture','{{}}')"),
        ('handoffs_cart_scope', lambda f: f"INSERT INTO checkout_handoffs(digest,tenant,cart_id,expires_at) VALUES('security-handoff','{ta}','{f['cart']['id']}',now())"),
        ('projections_event_scope', lambda f: f"INSERT INTO projections(tenant,event_id,kind,data) VALUES('{ta}',{f['event']},'fixture','{{}}') ON CONFLICT(event_id) DO UPDATE SET tenant=EXCLUDED.tenant"),
        ('knowledge_receipts_event_scope', lambda f: f"INSERT INTO knowledge_receipts(tenant,event_id) VALUES('{ta}',{f['event']}) ON CONFLICT DO NOTHING"),
        ('observed_pairs_event_scope', lambda f: f"INSERT INTO observed_pairs(tenant,left_id,right_id,orders,last_event) VALUES('{ta}','lamp','mug',1,{f['event']})"),
        ('pair_evidence_event_scope', lambda f: f"INSERT INTO pair_evidence(tenant,left_id,right_id,order_id,event_id,simulated) VALUES('{ta}','lamp','mug','{a['order']['id']}',{f['event']},true)"),
        ('flow_jobs_event_scope', lambda f: f"INSERT INTO flow_jobs(id,tenant,flow,event_id,definition,state) VALUES('security-flow','{ta}','fixture',{f['event']},'{{}}','completed')"),
        ('app_deliveries_event_scope', lambda f: f"INSERT INTO app_deliveries(tenant,app,event_id,state) VALUES('{ta}','care_studio',{f['event']},'delivered')"),
        ('schedule_runs_event_scope', lambda f: f"INSERT INTO app_schedule_runs(tenant,app,schedule,due,event_id) VALUES('{ta}','care_studio','fixture',now(),{f['event']})"),
        ('webhook_receipts_event_scope', lambda f: f"INSERT INTO app_webhook_receipts(tenant,app,webhook,request_key,digest,event_id) VALUES('{ta}','care_studio','fixture','fixture','fixture',{f['event']})"),
        ('releases_environment_scope', lambda f: f"INSERT INTO shop_releases(id,live_tenant,environment,selections,actor) VALUES('security-release','{ta}','{f['stage']}','[]','fixture')"),
        ('builds_environment_scope', lambda f: f"UPDATE developer_builds SET environment='{f['stage']}' WHERE tenant='{ta}' AND id='{a['build']['id']}'"),
        ('refunds_job_attempt_scope', lambda f: f"INSERT INTO payment_refunds(tenant,job_id,attempt_id,provider_id,status,amount_minor) VALUES('{ta}','{f['job']}','{f['attempt']}','security-refund','COMPLETED',1)"),
    ]
    for constraint, statement in cases:
        # Roll back both positive and negative probes; they must never affect workers.
        sql('BEGIN; ' + statement(a) + '; ROLLBACK;')
        sql("BEGIN; SET CONSTRAINTS ALL IMMEDIATE; DO $probe$ DECLARE failed text; BEGIN BEGIN " + statement(b) +
            "; RAISE EXCEPTION 'Cross-shop reference accepted: " + constraint + "'; "
            "EXCEPTION WHEN foreign_key_violation THEN GET STACKED DIAGNOSTICS failed=CONSTRAINT_NAME; "
            "IF failed <> '" + constraint + "' THEN RAISE EXCEPTION 'Wrong rejection: %',failed; END IF; "
            "END; END $probe$; ROLLBACK;")
        passed('Database denies foreign link: ' + constraint)
    # A new ID-only foreign key between tenant tables must have a scoped counterpart.
    # Stage links intentionally pair live_tenant with the child's owning tenant.
    reference_query = """SELECT child.relname||'.'||fk.conname FROM pg_constraint fk
      JOIN pg_class child ON child.oid=fk.conrelid
      JOIN pg_class parent ON parent.oid=fk.confrelid
      JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attname='tenant'
      JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attname='tenant'
      WHERE fk.contype='f' AND child.relnamespace='public'::regnamespace
      AND NOT EXISTS(SELECT 1 FROM pg_constraint scoped
        WHERE scoped.contype='f' AND scoped.conrelid=fk.conrelid AND scoped.confrelid=fk.confrelid
        AND scoped.conkey @> fk.conkey AND scoped.confkey @> fk.confkey
        AND ca.attnum=ANY(scoped.conkey)
        AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=parent.oid
          AND a.attname IN ('tenant','live_tenant') AND a.attnum=ANY(scoped.confkey)))
      ORDER BY child.relname,fk.conname"""
    uncovered = sql(reference_query)
    assert not uncovered, 'Unscoped tenant relationships: ' + uncovered
    passed('Schema-wide guard rejects ID-only links between tenant tables without a scoped counterpart')
    broken = sql("BEGIN; CREATE TABLE public.security_bad_reference(tenant text NOT NULL,order_id text REFERENCES orders(id)); " + reference_query + "; ROLLBACK;")
    assert 'security_bad_reference' in broken, broken
    passed('Negative schema control detects a newly introduced unscoped order reference')
    # Inspection is explicit: core RLS is still absent. App RLS must work under an
    # ordinary role, not the superuser used by the local container.
    role = 'security_reader_' + ta.replace('-', '_')
    table = 'app_' + hashlib.sha256((ta+':care_studio').encode()).hexdigest()[:24] + '_guides'
    sql(f"CREATE ROLE {role} NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO {role}; GRANT SELECT,INSERT ON {table} TO {role};")
    try:
        assert sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT count(*) FROM {table}; ROLLBACK;").strip() == '0'
        for t in (ta, tb):
            out = sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('rac.tenant','{t}',true); SELECT string_agg(tenant,',') FROM {table}; ROLLBACK;")
            assert out.splitlines() == ([t, t] if t == ta else [t]), out
        # Transaction-local context disappears on commit on the very same connection.
        out = sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('rac.tenant','{ta}',true); COMMIT; BEGIN; SET LOCAL ROLE {role}; SELECT count(*) FROM {table}; ROLLBACK;")
        assert out.splitlines()[-1] == '0', out
        sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('rac.tenant','{ta}',true); DO $probe$ BEGIN BEGIN INSERT INTO {table}(tenant,id,title) VALUES('{tb}','forged','{{\"en\":\"Forged\"}}'); RAISE EXCEPTION 'RLS accepted foreign row'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $probe$; ROLLBACK;")
        passed('App RLS denies missing/foreign context and resets on pooled connection reuse under NOSUPERUSER NOBYPASSRLS')
    finally:
        sql(f'DROP OWNED BY {role}; DROP ROLE {role};')
