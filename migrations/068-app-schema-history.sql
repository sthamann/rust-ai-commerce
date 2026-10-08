-- Bounded migration recovery snapshots retain the source package and original records.
CREATE TABLE app_schema_history(
 tenant text NOT NULL, app text NOT NULL, to_version text NOT NULL,
 from_version text NOT NULL, old_manifest jsonb NOT NULL, records jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,app,to_version),
 FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id),
 CHECK(octet_length(records::text)<=4194304)
);
ALTER TABLE app_schema_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_schema_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app_schema_history
 USING(tenant=current_setting('rac.tenant',true)) WITH CHECK(tenant=current_setting('rac.tenant',true));
