-- Durable flow sequences and source rule metadata remain scoped to their owning tenant.
SET search_path=public;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS automation jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS commerce_customer_groups(tenant text NOT NULL,id text NOT NULL,data jsonb NOT NULL DEFAULT '{}',revision bigint NOT NULL DEFAULT 1,PRIMARY KEY(tenant,id));
ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS cursor text;
ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS execution jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS flow_jobs_ready ON flow_jobs(available_at,event_id) WHERE state='queued';
CREATE TABLE IF NOT EXISTS flow_steps(job text NOT NULL REFERENCES flow_jobs(id),node text NOT NULL,state text NOT NULL DEFAULT 'running',result jsonb,error text,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,PRIMARY KEY(job,node));
CREATE INDEX IF NOT EXISTS flow_jobs_tenant_recent ON flow_jobs(tenant,event_id DESC,id);
CREATE INDEX IF NOT EXISTS flow_jobs_expired_lease ON flow_jobs(lease_until) WHERE state='running';
CREATE INDEX IF NOT EXISTS order_customer_rule_history ON orders(tenant,(data->'orderCustomer'->>'customerId'),created_at);
CREATE INDEX IF NOT EXISTS review_customer_rule_history ON product_reviews(tenant,session);
