-- Durable autonomy uses the same settings lock and task transaction; count unique SKUs per UTC day.
ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_id_key UNIQUE(tenant,id);
CREATE TABLE ai_price_budget(
 tenant text NOT NULL REFERENCES tenants(id),day date NOT NULL,product_id text NOT NULL,
 baseline_minor bigint NOT NULL CHECK(baseline_minor>=0),currency text NOT NULL,task_id text NOT NULL,actor text NOT NULL,
 PRIMARY KEY(tenant,day,product_id),
 FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant,task_id) REFERENCES tasks(tenant,id)
);
ALTER TABLE ai_price_budget ENABLE ROW LEVEL SECURITY;ALTER TABLE ai_price_budget FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON ai_price_budget USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),'')) WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
