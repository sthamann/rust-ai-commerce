-- Private tenant sandboxes and immutable app development artifacts. Never clone PII or PSP credentials.
SET search_path = public;
CREATE TABLE IF NOT EXISTS shop_environments (
 tenant text PRIMARY KEY REFERENCES tenants(id), live_tenant text NOT NULL REFERENCES tenants(id),
 name text NOT NULL, baseline jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(tenant<>live_tenant)
);
CREATE INDEX IF NOT EXISTS environments_live ON shop_environments(live_tenant);
CREATE TABLE IF NOT EXISTS shop_releases (
 id text PRIMARY KEY, live_tenant text NOT NULL, environment text NOT NULL REFERENCES shop_environments(tenant),
 selections jsonb NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS developer_builds (
 id text PRIMARY KEY, tenant text NOT NULL REFERENCES tenants(id), environment text NOT NULL REFERENCES shop_environments(tenant),
 app text NOT NULL, version text NOT NULL, digest text NOT NULL, manifest jsonb NOT NULL,
 prompt text NOT NULL, provider text NOT NULL, model text, summary jsonb NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','staged')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant,app,version)
);
