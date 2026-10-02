-- Customer identity and address books share composite tenant ownership constraints.
SET search_path=public;
ALTER TABLE customers ADD COLUMN id text NOT NULL DEFAULT replace(gen_random_uuid()::text,'-','');
ALTER TABLE customers ADD COLUMN customer_number text NOT NULL DEFAULT ('C-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,12)));
ALTER TABLE customers ADD CONSTRAINT customers_tenant_id UNIQUE(tenant,id);
ALTER TABLE customers ADD CONSTRAINT customers_tenant_number UNIQUE(tenant,customer_number);
ALTER TABLE customers ADD COLUMN default_billing_address_id text;
ALTER TABLE customers ADD COLUMN default_shipping_address_id text;
CREATE TABLE customer_addresses (
 tenant text NOT NULL,email text NOT NULL,id text NOT NULL,revision bigint NOT NULL DEFAULT 1,
 data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id),UNIQUE(tenant,email,id),
 FOREIGN KEY(tenant,email) REFERENCES customers(tenant,email) ON DELETE CASCADE
);
CREATE INDEX customer_addresses_owner ON customer_addresses(tenant,email,id);
ALTER TABLE customers ADD FOREIGN KEY(tenant,email,default_billing_address_id) REFERENCES customer_addresses(tenant,email,id) ON DELETE SET NULL(default_billing_address_id);
ALTER TABLE customers ADD FOREIGN KEY(tenant,email,default_shipping_address_id) REFERENCES customer_addresses(tenant,email,id) ON DELETE SET NULL(default_shipping_address_id);
INSERT INTO customer_addresses(tenant,email,id,data)
SELECT tenant,email,md5(tenant||':'||email||':legacy-address'),profile->'address'||jsonb_build_object('country','DE') FROM customers
WHERE jsonb_typeof(profile->'address')='object' AND coalesce(profile->'address'->>'street','')<>'';
UPDATE customers c SET default_billing_address_id=a.id,default_shipping_address_id=a.id FROM customer_addresses a WHERE c.tenant=a.tenant AND c.email=a.email;
CREATE INDEX orders_customer_id ON orders(tenant,(data->'orderCustomer'->>'customerId'),created_at DESC);
ALTER TABLE customers ADD COLUMN sales_channel_id text NOT NULL DEFAULT 'default';
ALTER TABLE customers ADD COLUMN language_id text NOT NULL DEFAULT 'en-GB';
ALTER TABLE customers ADD COLUMN first_login timestamptz;
ALTER TABLE customers ADD COLUMN last_login timestamptz;
ALTER TABLE customers ADD COLUMN last_payment_method_id text;
