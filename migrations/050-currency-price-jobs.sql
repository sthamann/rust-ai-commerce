-- Durable tenant-owned generation checkpoints; row locks serialize concurrent product edits; each batch reads current source data.
-- Existing products receive their migration timestamp; new inserts record creation without relying on ID ordering.
ALTER TABLE products ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE TABLE currency_price_jobs (
 tenant text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, id text NOT NULL,
 data jsonb NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','completed','failed')),
 cursor text NOT NULL DEFAULT '', ceiling text NOT NULL DEFAULT '', processed bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant,id)
);
CREATE INDEX currency_price_work ON currency_price_jobs(created_at) WHERE state='queued';
ALTER TABLE currency_price_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_price_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY currency_price_scope ON currency_price_jobs
 USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''))
 WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
