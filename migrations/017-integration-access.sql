-- Revocable tenant-bound API/MCP keys and chronological order keyset paging.
SET search_path=public;
CREATE TABLE integration_keys(id text NOT NULL,tenant text NOT NULL REFERENCES tenants(id),user_id text NOT NULL REFERENCES merchant_users(id),digest text UNIQUE NOT NULL,name text NOT NULL,permissions jsonb NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant,id));
CREATE INDEX integration_keys_identity ON integration_keys(user_id,tenant);
CREATE INDEX order_chronological_page ON orders(tenant,created_at DESC,id DESC);
