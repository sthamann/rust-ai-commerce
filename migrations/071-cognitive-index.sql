-- Transactional source-change intake; inference happens outside transactions under fenced leases.
CREATE TABLE embedding_jobs (
 tenant text NOT NULL REFERENCES tenants(id),kind text NOT NULL CHECK(kind IN ('product','document')),
 object_id text NOT NULL, revision bigint NOT NULL DEFAULT 1, attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),lease text,lease_until timestamptz,error_code text,
 PRIMARY KEY(tenant,kind,object_id)
);
CREATE INDEX embedding_jobs_ready ON embedding_jobs(available_at,tenant) WHERE attempts<8;
ALTER TABLE embedding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON embedding_jobs USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),'')) WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
ALTER TABLE semantic_products ADD COLUMN vector_digest text;
UPDATE semantic_products SET vector_digest=md5(embedding::text);
CREATE FUNCTION cognitive_vector_digest() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.vector_digest=md5(NEW.embedding::text); RETURN NEW; END $$;
CREATE TRIGGER cognitive_vector_digest BEFORE INSERT OR UPDATE OF embedding ON semantic_products FOR EACH ROW EXECUTE FUNCTION cognitive_vector_digest();
CREATE FUNCTION cognitive_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE object_key text;
BEGIN
 IF TG_TABLE_NAME='products' THEN
  object_key=NEW.id;
  IF TG_OP='UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.description IS NOT DISTINCT FROM OLD.description AND NEW.category IS NOT DISTINCT FROM OLD.category THEN RETURN NEW; END IF;
 ELSE
  object_key=NEW.document_id||':'||NEW.position;
  IF TG_OP='UPDATE' AND NEW.text IS NOT DISTINCT FROM OLD.text THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO embedding_jobs(tenant,kind,object_id) VALUES(NEW.tenant,TG_ARGV[0],object_key)
 ON CONFLICT(tenant,kind,object_id) DO UPDATE SET revision=embedding_jobs.revision+1,attempts=0,available_at=now(),lease=NULL,lease_until=NULL,error_code=NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER cognitive_product_intake AFTER INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION cognitive_source_changed('product');
CREATE TRIGGER cognitive_document_intake AFTER INSERT OR UPDATE ON knowledge_chunks FOR EACH ROW EXECUTE FUNCTION cognitive_source_changed('document');
INSERT INTO embedding_jobs(tenant,kind,object_id) SELECT tenant,'product',id FROM products;
INSERT INTO embedding_jobs(tenant,kind,object_id) SELECT tenant,'document',document_id||':'||position FROM knowledge_chunks;

-- Search publication has independent fenced leases; external requests never hold a SQL transaction.
ALTER TABLE vector_index_queue ADD COLUMN revision bigint NOT NULL DEFAULT 1,ADD COLUMN lease text,ADD COLUMN lease_until timestamptz,ADD COLUMN attempts integer NOT NULL DEFAULT 0,ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION queue_vector_index() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE row_data jsonb;
BEGIN
 row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 INSERT INTO vector_index_queue(tenant,kind,object_id) VALUES(row_data->>'tenant',TG_ARGV[0],CASE WHEN TG_ARGV[0]='product' THEN row_data->>'product_id' ELSE (row_data->>'document_id')||':'||(row_data->>'position') END)
 ON CONFLICT(tenant,kind,object_id) DO UPDATE SET updated_at=now(),revision=vector_index_queue.revision+1,lease=NULL,lease_until=NULL,attempts=0,available_at=now();
 RETURN NEW;
END $fn$;

-- Model geometry is validated at intake; PostgreSQL bounds every persisted vector independently.
ALTER TABLE semantic_products DROP CONSTRAINT semantic_products_embedding_check;
ALTER TABLE semantic_products ADD CONSTRAINT cognitive_product_geometry CHECK(cardinality(embedding) BETWEEN 1 AND 8192);
ALTER TABLE knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_embedding_check;
ALTER TABLE knowledge_chunks ADD CONSTRAINT cognitive_chunk_geometry CHECK(embedding IS NULL OR cardinality(embedding) BETWEEN 1 AND 8192);
