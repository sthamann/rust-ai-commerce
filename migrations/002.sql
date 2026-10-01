CREATE EXTENSION IF NOT EXISTS age;
CREATE EXTENSION IF NOT EXISTS vector;
LOAD 'age';
SET search_path = ag_catalog, public;
SELECT create_graph('commerce') WHERE NOT EXISTS (SELECT 1 FROM ag_graph WHERE name='commerce');
SELECT create_vlabel('commerce','Product') WHERE NOT EXISTS (SELECT 1 FROM ag_label WHERE name='Product' AND graph=(SELECT graphid FROM ag_graph WHERE name='commerce'));
SELECT create_vlabel('commerce','Need') WHERE NOT EXISTS (SELECT 1 FROM ag_label WHERE name='Need' AND graph=(SELECT graphid FROM ag_graph WHERE name='commerce'));
SELECT create_elabel('commerce','SERVES') WHERE NOT EXISTS (SELECT 1 FROM ag_label WHERE name='SERVES' AND graph=(SELECT graphid FROM ag_graph WHERE name='commerce'));
SELECT create_elabel('commerce','PAIRS_WITH') WHERE NOT EXISTS (SELECT 1 FROM ag_label WHERE name='PAIRS_WITH' AND graph=(SELECT graphid FROM ag_graph WHERE name='commerce'));
CREATE UNIQUE INDEX IF NOT EXISTS graph_product_identity ON commerce."Product" ((properties -> '"tenant"'::agtype),(properties -> '"product_id"'::agtype));
CREATE UNIQUE INDEX IF NOT EXISTS graph_need_identity ON commerce."Need" ((properties -> '"tenant"'::agtype),(properties -> '"name"'::agtype));
CREATE INDEX IF NOT EXISTS graph_serves_source ON commerce."SERVES"(start_id);
CREATE INDEX IF NOT EXISTS graph_serves_target ON commerce."SERVES"(end_id);
CREATE INDEX IF NOT EXISTS graph_pairs_source ON commerce."PAIRS_WITH"(start_id);
SET search_path = public;
CREATE TABLE IF NOT EXISTS semantic_products (
 tenant text NOT NULL, product_id text NOT NULL, revision bigint NOT NULL,
 embedding vector(1024) NOT NULL, embedding_model text NOT NULL, content_hash text NOT NULL,
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
