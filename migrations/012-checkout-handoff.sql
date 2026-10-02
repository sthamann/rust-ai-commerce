-- Generic single-use handoff between independent storefronts and the checkout host.
SET search_path=public;
CREATE TABLE IF NOT EXISTS checkout_handoffs (
 digest text PRIMARY KEY, tenant text NOT NULL REFERENCES tenants(id),
 cart_id text NOT NULL UNIQUE REFERENCES carts(id), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS checkout_handoff_expiry ON checkout_handoffs(expires_at);
