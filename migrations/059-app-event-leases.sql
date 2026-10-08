-- Fenced delivery attempts and tenant-fair dispatch; no second event queue.
ALTER TABLE app_deliveries ADD COLUMN lease_token uuid;
ALTER TABLE app_deliveries ADD COLUMN last_attempt_at timestamptz;
CREATE INDEX app_deliveries_dispatch ON app_deliveries(state,available_at,tenant,app,event_id)
    WHERE state IN ('queued','running');
CREATE INDEX app_deliveries_tenant_running ON app_deliveries(tenant,lease_until) WHERE state='running';
