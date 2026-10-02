-- Native catalogue/checkout persistence. All relationships remain tenant scoped.
ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_days integer NOT NULL DEFAULT 2 CHECK(delivery_days BETWEEN 0 AND 365);
CREATE INDEX IF NOT EXISTS product_family ON products(tenant,parent_id);
CREATE TABLE IF NOT EXISTS commerce_settings (
 tenant text PRIMARY KEY, data jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS product_reviews (
 id text PRIMARY KEY, tenant text NOT NULL, product_id text NOT NULL, session text NOT NULL,
 author text NOT NULL CHECK(length(author) BETWEEN 1 AND 80), rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120), content text NOT NULL CHECK(length(content) BETWEEN 1 AND 3000),
 approved boolean NOT NULL DEFAULT false, verified boolean NOT NULL DEFAULT false, demo boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant,product_id,session),
 FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id)
);
CREATE INDEX IF NOT EXISTS approved_reviews ON product_reviews(tenant,product_id,created_at DESC) WHERE approved;
