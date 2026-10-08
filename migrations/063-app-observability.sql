-- App action telemetry stores metadata and digests, never action arguments or customer data.
CREATE TABLE app_action_log (
 id bigserial PRIMARY KEY, tenant text NOT NULL, app text NOT NULL, action text NOT NULL,
 actor text NOT NULL, status integer NOT NULL, duration_ms bigint NOT NULL,
 input_digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id)
);
CREATE INDEX app_action_log_cursor ON app_action_log(tenant,app,id DESC);
ALTER TABLE app_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_action_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app_action_log
 USING(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on')
 WITH CHECK(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on');
CREATE INDEX app_delivery_fairness ON app_deliveries(tenant,app,last_attempt_at DESC)
 WHERE last_attempt_at IS NOT NULL;
