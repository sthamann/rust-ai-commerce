-- Operational CRM, scoped permissions, immutable receipts and binary assets.
SET search_path=public;
ALTER TABLE memberships ADD COLUMN permissions jsonb NOT NULL DEFAULT 'null'::jsonb;
ALTER TABLE customers ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN revision bigint NOT NULL DEFAULT 1;
ALTER TABLE customers ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE order_activity(id bigserial PRIMARY KEY,tenant text NOT NULL,order_id text NOT NULL REFERENCES orders(id),actor text NOT NULL,kind text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX order_activity_scope ON order_activity(tenant,order_id,id);
CREATE INDEX customer_order_lookup ON carts(tenant,(data->>'email'),id);
CREATE TABLE receipt_counters(tenant text NOT NULL,kind text NOT NULL,next_number bigint NOT NULL DEFAULT 1,PRIMARY KEY(tenant,kind));
CREATE TABLE order_receipts(id text NOT NULL,tenant text NOT NULL,order_id text NOT NULL REFERENCES orders(id),kind text NOT NULL,number text NOT NULL,locale text NOT NULL,snapshot jsonb NOT NULL,request_key text NOT NULL,fingerprint text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant,id),UNIQUE(tenant,request_key),UNIQUE(tenant,number));
CREATE INDEX order_receipts_scope ON order_receipts(tenant,order_id,created_at);
CREATE TABLE receipt_settings(tenant text PRIMARY KEY,data jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1);
CREATE TABLE product_assets(tenant text NOT NULL,id text NOT NULL,product_id text NOT NULL,title jsonb NOT NULL,filename text NOT NULL,mime text NOT NULL,kind text NOT NULL CHECK(kind IN ('attachment','download')),public boolean NOT NULL DEFAULT false,content bytea NOT NULL,digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant,id),FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id));
CREATE INDEX product_assets_scope ON product_assets(tenant,product_id,kind);
CREATE TABLE order_downloads(tenant text NOT NULL,order_id text NOT NULL REFERENCES orders(id),asset_id text NOT NULL,PRIMARY KEY(tenant,order_id,asset_id),FOREIGN KEY(tenant,asset_id) REFERENCES product_assets(tenant,id));

ALTER TABLE payment_attempts ADD COLUMN bn_code text NOT NULL DEFAULT 'shopwareAG_Cart_Shopware6_PPCP';
CREATE TABLE payment_refunds(tenant text NOT NULL,job_id text NOT NULL,attempt_id text NOT NULL,provider_id text NOT NULL,status text NOT NULL,amount_minor bigint NOT NULL,PRIMARY KEY(tenant,job_id),UNIQUE(tenant,provider_id));
