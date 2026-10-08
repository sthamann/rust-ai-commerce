-- Keep original app consent separate from mapped core rights. Existing callback keys fail closed until renewed.
ALTER TABLE integration_keys ADD COLUMN app_permissions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(app_permissions)='array');
