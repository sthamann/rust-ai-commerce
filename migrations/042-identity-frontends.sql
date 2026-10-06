-- Generic, operator-enabled identity brokers and hosted storefront mounts. No private application code.
CREATE TABLE merchant_identities (
 issuer text NOT NULL, subject text NOT NULL, user_id text NOT NULL REFERENCES merchant_users(id),
 PRIMARY KEY(issuer,subject)
);
CREATE TABLE identity_nonces (digest text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE merchant_handoffs (
 digest text PRIMARY KEY,user_id text NOT NULL REFERENCES merchant_users(id),
 tenant text NOT NULL REFERENCES tenants(id),expires_at timestamptz NOT NULL
);
CREATE TABLE hosted_frontends (
 alias text PRIMARY KEY,tenant text NOT NULL,channel text NOT NULL,origin text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant,channel) REFERENCES sales_channels(tenant,id) ON DELETE RESTRICT
);
CREATE INDEX hosted_frontends_tenant ON hosted_frontends(tenant);
CREATE TABLE identity_inference_daily(email text NOT NULL,day date NOT NULL,calls integer NOT NULL,PRIMARY KEY(email,day));
