-- Standard PostgreSQL storage; Qdrant is a rebuildable index, embeddings remain exportable.
CREATE TABLE IF NOT EXISTS semantic_products (
 tenant text NOT NULL, product_id text NOT NULL, revision bigint NOT NULL,
 embedding real[] CHECK(cardinality(embedding)=1024) NOT NULL, embedding_model text NOT NULL, content_hash text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,product_id),
 FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id)
);
CREATE TABLE IF NOT EXISTS conversations (
 tenant text NOT NULL, id text NOT NULL, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
 id bigserial PRIMARY KEY, tenant text NOT NULL, conversation_id text NOT NULL,
 role text NOT NULL CHECK(role IN ('user','assistant','system')), content text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant,conversation_id) REFERENCES conversations(tenant,id)
);
CREATE INDEX IF NOT EXISTS chat_history ON chat_messages(tenant,conversation_id,id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS list_price double precision;
ALTER TABLE products ADD COLUMN IF NOT EXISTS regulation_price double precision;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reference_price jsonb;
