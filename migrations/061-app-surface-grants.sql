-- Short-lived UI capabilities, separately scoped from the merchant session used by the host.
CREATE TABLE app_surface_grants (
 tenant text NOT NULL, token_hash text NOT NULL, app text NOT NULL, surface text NOT NULL,
 actor_hash text NOT NULL, package_digest text NOT NULL, actions jsonb NOT NULL, context jsonb NOT NULL,
 expires_at timestamptz NOT NULL, PRIMARY KEY(tenant,token_hash),
 FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id)
);
CREATE INDEX app_surface_grant_expiry ON app_surface_grants(tenant,app,expires_at);
ALTER TABLE app_surface_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_surface_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app_surface_grants
 USING(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on')
 WITH CHECK(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on');
