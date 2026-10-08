-- Mutable private editor drafts remain separate from immutable package versions.
CREATE TABLE developer_drafts (
 tenant text NOT NULL REFERENCES tenants(id), actor_key text NOT NULL, id text NOT NULL,
 manifest jsonb NOT NULL, environment text, revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,actor_key,id),
 FOREIGN KEY(environment,tenant) REFERENCES shop_environments(tenant,live_tenant)
);
ALTER TABLE developer_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON developer_drafts
 USING(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on')
 WITH CHECK(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on');
