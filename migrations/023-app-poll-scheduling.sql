-- Rotate bounded export polling across all installed tenants rather than starving shops after the first batch.
ALTER TABLE app_export_cursors ADD COLUMN last_poll timestamptz NOT NULL DEFAULT 'epoch';
CREATE INDEX app_export_poll ON app_export_cursors(last_poll,tenant,app);
