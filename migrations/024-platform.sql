-- Platform operators are separate from tenant membership and never granted by public signup.
CREATE TABLE platform_operators (
 user_id text PRIMARY KEY REFERENCES merchant_users(id), active boolean NOT NULL DEFAULT true,
 granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_audit (
 id bigserial PRIMARY KEY, actor text REFERENCES merchant_users(id), action text NOT NULL,
 tenant text, data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_audit_time ON platform_audit(created_at DESC,id DESC);
CREATE INDEX platform_orders_window ON orders(created_at,tenant);
