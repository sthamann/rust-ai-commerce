-- Durable tenant translation jobs; bounded workers never hold a database connection during inference.
CREATE TABLE translation_jobs (
 tenant text NOT NULL REFERENCES tenants(id), id text NOT NULL, source_locale text NOT NULL,
 target_locale text NOT NULL, choice jsonb NOT NULL, overwrite boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'queued', cursor text NOT NULL DEFAULT '', highwater text NOT NULL DEFAULT '',
 total bigint NOT NULL, processed bigint NOT NULL DEFAULT 0, lease text, lease_until timestamptz,
 error text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,id)
);
CREATE INDEX translation_jobs_work ON translation_jobs(created_at) WHERE status IN ('queued','processing');
CREATE TABLE translation_items (
 tenant text NOT NULL, job_id text NOT NULL, product_id text NOT NULL, revision bigint NOT NULL,
 source jsonb NOT NULL, result jsonb NOT NULL, status text NOT NULL DEFAULT 'ready',
 PRIMARY KEY(tenant,job_id,product_id), FOREIGN KEY(tenant,job_id) REFERENCES translation_jobs(tenant,id) ON DELETE CASCADE
);
CREATE INDEX translation_items_ready ON translation_items(tenant,job_id,product_id) WHERE status='ready';
