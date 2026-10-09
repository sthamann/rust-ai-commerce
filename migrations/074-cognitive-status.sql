-- Exact small read model maintained in the same transaction as index intake/publication.
CREATE TABLE knowledge_index_status (
 tenant text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 indexed_products bigint NOT NULL DEFAULT 0 CHECK(indexed_products>=0),
 pending_jobs bigint NOT NULL DEFAULT 0 CHECK(pending_jobs>=0)
);
INSERT INTO knowledge_index_status(tenant,indexed_products,pending_jobs)
 SELECT t.id,(SELECT count(*) FROM semantic_products s WHERE s.tenant=t.id),
 (SELECT count(*) FROM embedding_jobs j WHERE j.tenant=t.id) FROM tenants t;
ALTER TABLE knowledge_index_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_index_status FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON knowledge_index_status USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),'')) WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
CREATE FUNCTION cognitive_status_delta() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE shop text; delta integer;
BEGIN
 shop=CASE WHEN TG_OP='DELETE' THEN OLD.tenant ELSE NEW.tenant END;
 delta=CASE WHEN TG_OP='DELETE' THEN -1 ELSE 1 END;
 IF EXISTS(SELECT 1 FROM tenants WHERE id=shop) THEN
  INSERT INTO knowledge_index_status(tenant) VALUES(shop) ON CONFLICT DO NOTHING;
  UPDATE knowledge_index_status SET
   indexed_products=indexed_products+CASE WHEN TG_TABLE_NAME='semantic_products' THEN delta ELSE 0 END,
   pending_jobs=pending_jobs+CASE WHEN TG_TABLE_NAME='embedding_jobs' THEN delta ELSE 0 END
  WHERE tenant=shop;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER cognitive_status_index AFTER INSERT OR DELETE ON semantic_products FOR EACH ROW EXECUTE FUNCTION cognitive_status_delta();
CREATE TRIGGER cognitive_status_pending AFTER INSERT OR DELETE ON embedding_jobs FOR EACH ROW EXECUTE FUNCTION cognitive_status_delta();
ALTER TABLE vector_index_queue ADD COLUMN error_code text;
CREATE INDEX embedding_jobs_diagnostics ON embedding_jobs(tenant,error_code) WHERE error_code IS NOT NULL;

-- A fresh source revision clears terminal publication diagnostics along with its retry fence.
CREATE OR REPLACE FUNCTION queue_vector_index() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE row_data jsonb;
BEGIN
 row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 INSERT INTO vector_index_queue(tenant,kind,object_id) VALUES(row_data->>'tenant',TG_ARGV[0],CASE WHEN TG_ARGV[0]='product' THEN row_data->>'product_id' ELSE (row_data->>'document_id')||':'||(row_data->>'position') END)
 ON CONFLICT(tenant,kind,object_id) DO UPDATE SET updated_at=now(),revision=vector_index_queue.revision+1,lease=NULL,lease_until=NULL,attempts=0,error_code=NULL,available_at=now();
 RETURN NEW;
END $fn$;
