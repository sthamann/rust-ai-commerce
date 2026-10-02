SET search_path=public;
CREATE TABLE IF NOT EXISTS commerce_rules (
 tenant text NOT NULL,id text NOT NULL,name jsonb NOT NULL,condition jsonb NOT NULL,active boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1,PRIMARY KEY(tenant,id)
);
CREATE TABLE IF NOT EXISTS commerce_promotions (
 tenant text NOT NULL,id text NOT NULL,data jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant,id)
);
CREATE TABLE IF NOT EXISTS promotion_uses (
 tenant text NOT NULL,promotion text NOT NULL,order_id text NOT NULL REFERENCES orders(id),
 PRIMARY KEY(tenant,promotion,order_id),FOREIGN KEY(tenant,promotion) REFERENCES commerce_promotions(tenant,id)
);
CREATE TABLE IF NOT EXISTS commerce_flows (
 tenant text NOT NULL,id text NOT NULL,data jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant,id)
);
CREATE TABLE IF NOT EXISTS flow_jobs (
 id text PRIMARY KEY,tenant text NOT NULL,flow text NOT NULL,event_id bigint NOT NULL REFERENCES outbox(id),
 definition jsonb NOT NULL,state text NOT NULL DEFAULT 'queued',lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,
 result jsonb,error text, UNIQUE(tenant,flow,event_id)
);
CREATE TABLE IF NOT EXISTS sales_channels (
 tenant text NOT NULL,id text NOT NULL,data jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,PRIMARY KEY(tenant,id)
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}';
-- Anonymous, shop-scoped behavior; no cross-merchant identity or model weight updates.
CREATE TABLE IF NOT EXISTS session_signals (
 tenant text NOT NULL, session text NOT NULL, product_id text NOT NULL,
 views integer NOT NULL DEFAULT 0, cart_adds integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,session,product_id), FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id)
);
CREATE TABLE IF NOT EXISTS session_signal_events (
 tenant text NOT NULL,id text NOT NULL,session text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant,id)
);
