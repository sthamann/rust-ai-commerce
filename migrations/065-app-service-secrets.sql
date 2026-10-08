-- Per-tenant/app server credentials reuse the platform AES-GCM key. Reads expose metadata only.
CREATE TABLE app_service_secrets(
 tenant text NOT NULL, app text NOT NULL, kind text NOT NULL CHECK(kind IN ('service','webhook','outbound')),
 ciphertext text NOT NULL, package_digest text NOT NULL CHECK(package_digest ~ '^[a-f0-9]{64}$'),
 revision bigint NOT NULL DEFAULT 1, actor text NOT NULL, rotated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,app,kind), FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id)
);
ALTER TABLE app_service_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_service_secrets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app_service_secrets USING(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on') WITH CHECK(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on');
