CREATE TABLE IF NOT EXISTS tenants(id text PRIMARY KEY CHECK(id ~ '^[a-z0-9][a-z0-9-]{1,47}$'),name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO tenants(id,name) VALUES('atelier','Atelier'),('workshop','Workshop') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS merchant_users(id text PRIMARY KEY,email text UNIQUE NOT NULL,name text NOT NULL,password_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS memberships(user_id text REFERENCES merchant_users(id),tenant text REFERENCES tenants(id),role text NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),active boolean NOT NULL DEFAULT true,PRIMARY KEY(user_id,tenant));
CREATE INDEX IF NOT EXISTS membership_tenant ON memberships(tenant,user_id) WHERE active;
CREATE TABLE IF NOT EXISTS user_sessions(digest text PRIMARY KEY,user_id text NOT NULL REFERENCES merchant_users(id),default_tenant text NOT NULL REFERENCES tenants(id),expires_at timestamptz NOT NULL DEFAULT now()+interval '12 hours',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS live_sessions ON user_sessions(user_id,expires_at);
CREATE TABLE IF NOT EXISTS user_invites(id text PRIMARY KEY,digest text UNIQUE NOT NULL,tenant text NOT NULL REFERENCES tenants(id),email text NOT NULL,role text NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),created_by text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',redeemed_at timestamptz);
-- Credentials are independent of customer accounts; ordinary users own memberships, never a platform-wide token.
