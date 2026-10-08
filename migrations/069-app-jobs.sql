-- App execution uses the existing leased outbox dispatcher; this table stores only its durable request/progress contract.
CREATE TABLE app_jobs (
 tenant text NOT NULL, app text NOT NULL, id text NOT NULL,
 action text NOT NULL, actor text NOT NULL, permission text NOT NULL,
 package_digest text NOT NULL, request_key text NOT NULL, input_digest text NOT NULL,
 input jsonb NOT NULL, result jsonb, status text NOT NULL DEFAULT 'queued',
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
 message jsonb NOT NULL DEFAULT '{}'::jsonb, lease text, lease_until timestamptz,
 started_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 revision bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant,app,id), UNIQUE(tenant,app,request_key),
 FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id),
 CHECK(status IN ('queued','running','succeeded','failed','uncertain','cancel_requested','cancelled')),
 CHECK(octet_length(input::text)<=20000), CHECK(result IS NULL OR octet_length(result::text)<=40000)
);
CREATE INDEX app_jobs_active ON app_jobs(tenant,app,created_at DESC);
ALTER TABLE app_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app_jobs USING(tenant=current_setting('rac.tenant',true)) WITH CHECK(tenant=current_setting('rac.tenant',true));
