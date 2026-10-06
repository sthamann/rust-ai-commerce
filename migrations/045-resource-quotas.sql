-- Fleet-wide admitted interactive AI attempts; limits are operator-owned, not merchant-controlled.
CREATE TABLE tenant_resource_limits (
 tenant text PRIMARY KEY REFERENCES tenants(id), daily_ai bigint NOT NULL CHECK(daily_ai BETWEEN 1 AND 1000000), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE tenant_ai_usage (
 tenant text NOT NULL REFERENCES tenants(id), day date NOT NULL, attempts bigint NOT NULL CHECK(attempts>0), PRIMARY KEY(tenant,day)
);
ALTER TABLE tenant_resource_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_resource_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON tenant_resource_limits USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),'')) WITH CHECK(current_setting('rac.system',true)='on');
ALTER TABLE tenant_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_ai_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON tenant_ai_usage USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),'')) WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
