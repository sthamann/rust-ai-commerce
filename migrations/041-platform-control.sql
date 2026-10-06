-- Operator-only configuration and reversible shop lifecycle. Never remove order/payment evidence.
ALTER TABLE tenants ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived'));
ALTER TABLE tenants ADD COLUMN status_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE tenants ADD COLUMN status_updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE platform_ai (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), revision bigint NOT NULL DEFAULT 1,
 data jsonb NOT NULL DEFAULT '{}', secrets jsonb NOT NULL DEFAULT '{}',
 updated_by text REFERENCES merchant_users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_ai(id) VALUES(true);
ALTER TABLE channel_metrics ADD COLUMN total_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE channel_metrics ADD COLUMN max_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE channel_metrics ADD COLUMN timed_calls bigint NOT NULL DEFAULT 0;
