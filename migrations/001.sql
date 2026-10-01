CREATE TABLE IF NOT EXISTS products (
 tenant text NOT NULL, id text NOT NULL, name text NOT NULL, category text NOT NULL,
 description text NOT NULL, price double precision NOT NULL CHECK(price >= 0), tax_rate double precision NOT NULL,
 stock integer NOT NULL CHECK(stock >= 0), revision bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant,id)
);
CREATE TABLE IF NOT EXISTS customers (
 tenant text NOT NULL, email text NOT NULL, password_hash text NOT NULL,
 company text, group_name text NOT NULL DEFAULT 'consumer', PRIMARY KEY(tenant,email)
);
CREATE TABLE IF NOT EXISTS carts (
 id text PRIMARY KEY, tenant text NOT NULL, token text UNIQUE NOT NULL, data jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
 id text PRIMARY KEY, tenant text NOT NULL, cart_id text UNIQUE NOT NULL REFERENCES carts(id),
 idempotency_key text NOT NULL, fingerprint text NOT NULL, data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant,idempotency_key)
);
CREATE TABLE IF NOT EXISTS tasks (
 id text PRIMARY KEY, tenant text NOT NULL, proposal jsonb NOT NULL, applied boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS experiences (
 tenant text PRIMARY KEY, data jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS exposures (
 tenant text NOT NULL, session text NOT NULL, variant text NOT NULL,
 propensity double precision NOT NULL, rewarded boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,session)
);
CREATE TABLE IF NOT EXISTS policy (
 tenant text NOT NULL, variant text NOT NULL, views bigint NOT NULL DEFAULT 0,
 purchases bigint NOT NULL DEFAULT 0, PRIMARY KEY(tenant,variant)
);
CREATE TABLE IF NOT EXISTS outbox (
 id bigserial PRIMARY KEY, tenant text NOT NULL, kind text NOT NULL, data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(id) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS projections (
 event_id bigint PRIMARY KEY REFERENCES outbox(id), tenant text NOT NULL,
 kind text NOT NULL, data jsonb NOT NULL, projected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS extensions (
 tenant text PRIMARY KEY, wat text NOT NULL, digest text NOT NULL,
 revision bigint NOT NULL DEFAULT 1
);
