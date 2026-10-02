SET search_path=public;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS customer_sessions (
 digest text PRIMARY KEY,tenant text NOT NULL,email text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 FOREIGN KEY(tenant,email) REFERENCES customers(tenant,email) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS customer_sessions_expiry ON customer_sessions(expires_at);
