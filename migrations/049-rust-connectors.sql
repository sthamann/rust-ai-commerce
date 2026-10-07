-- Standard services use shared durable PostgreSQL state; tenant data is never kept in local SQLite.
CREATE TABLE connector_config (
 tenant text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, app text NOT NULL,
 data bytea NOT NULL, PRIMARY KEY(tenant,app)
);
CREATE TABLE connector_limits (
 tenant text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, app text NOT NULL,
 day date NOT NULL DEFAULT CURRENT_DATE, enqueued bigint NOT NULL DEFAULT 0,
 minute timestamptz NOT NULL DEFAULT date_trunc('minute',now()), dispatched bigint NOT NULL DEFAULT 0,
 last_started timestamptz NOT NULL DEFAULT 'epoch', PRIMARY KEY(tenant,app)
);
CREATE TABLE connector_jobs (
 tenant text NOT NULL, app text NOT NULL, id text NOT NULL, fingerprint text NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','completed','failed','uncertain')),
 payload bytea NOT NULL, result bytea, available timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0, lease_id uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,app,id),
 FOREIGN KEY(tenant,app) REFERENCES connector_limits(tenant,app) ON DELETE CASCADE
);
CREATE INDEX connector_job_claim ON connector_jobs(app,available,tenant) WHERE state='queued';
CREATE INDEX connector_job_leases ON connector_jobs(lease_until) WHERE state='running';
CREATE TABLE connector_oauth (
 digest text PRIMARY KEY, tenant text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 app text NOT NULL, data bytea NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE connector_sources (
 tenant text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, app text NOT NULL,
 id text NOT NULL, data bytea NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,app,id)
);
CREATE TABLE connector_changes (
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, app text NOT NULL, data bytea NOT NULL
);
CREATE INDEX connector_changes_scope ON connector_changes(tenant,app,seq);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['connector_config','connector_limits','connector_jobs','connector_oauth','connector_sources','connector_changes'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY connector_scope ON %I USING(current_setting(''rac.system'',true)=''on'' OR tenant=nullif(current_setting(''rac.tenant'',true),'''')) WITH CHECK(current_setting(''rac.system'',true)=''on'' OR tenant=nullif(current_setting(''rac.tenant'',true),''''))',t);
 END LOOP;
END $$;
