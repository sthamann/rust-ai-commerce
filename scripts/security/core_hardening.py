"""Real replica regressions for auth admission, poison-event isolation, retention and bounded resource leases."""
import time
import os
import urllib.request

def wait(sql, query, expected, seconds=20):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        value=sql(query)
        if value==expected:return
        time.sleep(.08)
    raise AssertionError((query,value,expected))

def before_workers(sql):
    sql("INSERT INTO outbox(tenant,kind,data,delivered_at) VALUES('atelier','qa.expired','{}',now()-interval '400 days');")
    sql("INSERT INTO outbox(tenant,kind,data,delivered_at) VALUES('atelier','qa.retired','{\"synthetic\":true}',now()-interval '100 days'); INSERT INTO projections(event_id,tenant,kind,data) SELECT id,tenant,kind,data FROM outbox WHERE kind='qa.retired'; INSERT INTO outbox(tenant,kind,data,available_at) VALUES('atelier','qa.unsettled','{}',now()+interval '1 day');")

def verify(sql, call, bases, owner):
    one,two=bases
    for base in bases:
        with urllib.request.urlopen(base+'/health') as response:
            assert response.headers['X-Content-Type-Options']=='nosniff'
            assert "script-src-attr 'none'" in response.headers['Content-Security-Policy']
            assert 'max-age=' in response.headers['Strict-Transport-Security']
        call(base,'/api/unregistered-sensitive-data',h=owner,expected=403)
    print('PASS security headers reach real HTTP responses and unknown authenticated API routes fail closed')
    wait(sql,"SELECT (data->>'retired')||':'||(payload_retired_at IS NOT NULL)::text FROM outbox WHERE kind='qa.retired'",'true:true')
    assert sql("SELECT count(*) FROM projections WHERE kind='qa.retired'")=='0'
    wait(sql,"SELECT count(*) FROM outbox WHERE kind='qa.expired'",'0')
    assert sql("SELECT payload_retired_at IS NULL FROM outbox WHERE kind='qa.unsettled'")=='t'
    print('PASS retention retires duplicate delivered payloads while preserving provenance IDs and unsettled work')
    sql("CREATE FUNCTION qa_poison_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='qa.poison' THEN RAISE EXCEPTION 'Synthetic projection failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER qa_poison BEFORE INSERT ON projections FOR EACH ROW EXECUTE FUNCTION qa_poison_projection();")
    poison=sql("INSERT INTO outbox(tenant,kind,data) VALUES('atelier','qa.poison','{}') RETURNING id")
    healthy=sql("INSERT INTO outbox(tenant,kind,data) VALUES('atelier','qa.healthy','{}') RETURNING id")
    wait(sql,f"SELECT delivered_at IS NOT NULL FROM outbox WHERE id={healthy}",'t')
    wait(sql,f"SELECT (attempts>0)::text FROM outbox WHERE id={poison}",'true')
    assert sql(f"SELECT delivered_at IS NULL FROM outbox WHERE id={poison}")=='t'
    sql(f"UPDATE outbox SET attempts=7,available_at=now() WHERE id={poison}")
    wait(sql,f"SELECT dead_letter_at IS NOT NULL FROM outbox WHERE id={poison}",'t')
    call(two,f'/api/runtime/outbox/{poison}/retry',{}, {**owner,'x-tenant':'workshop'},expected=404)
    sql('DROP TRIGGER qa_poison ON projections; DROP FUNCTION qa_poison_projection();')
    call(two,f'/api/runtime/outbox/{poison}/retry',{},owner)
    wait(sql,f"SELECT delivered_at IS NOT NULL FROM outbox WHERE id={poison}",'t')
    assert sql(f"SELECT attempts FROM outbox WHERE id={poison}")=='0'
    print('PASS poison event cannot block a healthy event; quarantine and tenant-scoped retry recover it')
    # Two replicas must observe the same durable allowance, including expiry recovery.
    sql(f"INSERT INTO resource_leases(id,tenant,class,expires_at) SELECT 'qa-cap-'||n,'atelier','requests',now()+interval '1 minute' FROM generate_series(1,{int(os.environ.get('TENANT_CONCURRENCY','16'))})n")
    for base in bases:
        call(base,'/api/merchant/commerce',h=owner,expected=429)
        call(base,'/store-api/product/mug',h=owner,expected=429)
    call(two,'/api/merchant/commerce',h={**owner,'x-tenant':'workshop'})
    sql("UPDATE resource_leases SET expires_at=now()-interval '1 second' WHERE id LIKE 'qa-cap-%'")
    call(two,'/api/merchant/commerce',h=owner)
    wait(sql,"SELECT count(*) FROM resource_leases WHERE id LIKE 'qa-cap-%'",'0')
    print('PASS replicas share tenant concurrency caps; another tenant remains available; expired leases recover')
    # Nonexistent credentials do not require an expensive password hash, but still share backoff.
    payload={'email':'qa-throttle@example.test','password':'wrong-but-long-enough'}
    for index in range(5):call(bases[index%2],'/api/auth/login',payload,expected=401)
    call(two,'/api/auth/login',payload,expected=429)
    sql('DELETE FROM auth_attempt_buckets')
    print('PASS failed login backoff persists across replicas rather than resetting on another process')
