CREATE TABLE IF NOT EXISTS languages (
 id text PRIMARY KEY, locale text NOT NULL UNIQUE, parent_id text REFERENCES languages(id)
);
INSERT INTO languages(id,locale) VALUES
 ('2fbb5fe2e29a4d70aa5854ce7ce3e20b','en-GB'),
 ('11111111111111111111111111111111','de-DE'),
 ('22222222222222222222222222222222','fr-FR'),
 ('33333333333333333333333333333333','es-ES') ON CONFLICT DO NOTHING;
INSERT INTO languages(id,locale,parent_id) VALUES
 ('44444444444444444444444444444444','de-CH','11111111111111111111111111111111') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS product_translations (
 tenant text NOT NULL, product_id text NOT NULL, language_id text NOT NULL REFERENCES languages(id),
 name text, description text, PRIMARY KEY(tenant,product_id,language_id),
 FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id)
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS advanced_prices jsonb NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_purchase integer NOT NULL DEFAULT 1 CHECK(min_purchase>0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_steps integer NOT NULL DEFAULT 1 CHECK(purchase_steps>0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_purchase integer CHECK(max_purchase>0);

CREATE TABLE IF NOT EXISTS channel_metrics (
 tenant text NOT NULL, channel text NOT NULL, calls bigint NOT NULL DEFAULT 0,
 failures bigint NOT NULL DEFAULT 0, last_seen timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,channel)
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS applied_at timestamptz;
