-- App callbacks reuse expiring integration keys and the creator's current membership.
ALTER TABLE integration_keys ADD COLUMN app_id text;
ALTER TABLE integration_keys ADD COLUMN package_digest text;
ALTER TABLE integration_keys ADD CONSTRAINT integration_app_scope FOREIGN KEY(tenant,app_id) REFERENCES app_packages(tenant,id);
ALTER TABLE integration_keys ADD CONSTRAINT integration_app_digest CHECK ((app_id IS NULL AND package_digest IS NULL) OR (app_id IS NOT NULL AND package_digest ~ '^[a-f0-9]{64}$'));
CREATE INDEX integration_app_active ON integration_keys(tenant,app_id,expires_at) WHERE app_id IS NOT NULL;
