-- Append-only transition preserves legacy AGE tables and converts persisted vectors without regeneration.
CREATE TABLE knowledge_relations (
 tenant text NOT NULL REFERENCES tenants(id),kind text NOT NULL,
 source_id text NOT NULL,target_id text NOT NULL,data jsonb NOT NULL DEFAULT '{}',
 PRIMARY KEY(tenant,kind,source_id,target_id)
);
CREATE INDEX knowledge_relations_target ON knowledge_relations(tenant,kind,target_id);
DO $migration$
DECLARE rel text;
BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='semantic_products' AND column_name='embedding' AND udt_name='vector') THEN
  ALTER TABLE semantic_products ALTER COLUMN embedding TYPE real[] USING translate(embedding::text,'[]','{}')::real[];
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_chunks' AND column_name='embedding' AND udt_name='vector') THEN
  ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE real[] USING translate(embedding::text,'[]','{}')::real[];
 END IF;
 -- Static edge labels only; legacy data is retained for audit/rollback and never silently deleted.
 FOREACH rel IN ARRAY ARRAY['SERVES','PAIRS_WITH','CO_PURCHASED','HAS_DOCUMENT'] LOOP
  IF to_regclass(format('commerce.%I',rel)) IS NOT NULL THEN
   PERFORM set_config('search_path','ag_catalog, public',true);
   EXECUTE format($sql$
    INSERT INTO knowledge_relations(tenant,kind,source_id,target_id,data)
    SELECT a.properties::text::jsonb->>'tenant',%L,a.properties::text::jsonb->>'product_id',
      COALESCE(b.properties::text::jsonb->>'product_id',b.properties::text::jsonb->>'name',b.properties::text::jsonb->>'document_id'),e.properties::text::jsonb
    FROM commerce.%I e JOIN commerce._ag_label_vertex a ON a.id=e.start_id JOIN commerce._ag_label_vertex b ON b.id=e.end_id
    WHERE a.properties::text::jsonb->>'tenant'=b.properties::text::jsonb->>'tenant'
    ON CONFLICT DO NOTHING
   $sql$,rel,rel);
  END IF;
 END LOOP;
 PERFORM set_config('search_path','public',true);
 -- App source metadata is canonical; rebuild scoped product references from it.
 INSERT INTO knowledge_relations(tenant,kind,source_id,target_id,data)
 SELECT tenant,'REFERENCES_PRODUCT',jsonb_build_array(app,source_id)::text,p.id,jsonb_build_object('app',app,'sourceId',source_id)
 FROM app_evidence e CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(metadata->'productIds')='array' THEN metadata->'productIds' ELSE '[]'::jsonb END) AS p(id)
 ON CONFLICT DO NOTHING;
END $migration$;
CREATE TABLE vector_index_queue(tenant text NOT NULL,kind text NOT NULL,object_id text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant,kind,object_id));
CREATE FUNCTION queue_vector_index() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE row_data jsonb;
BEGIN
 row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 INSERT INTO vector_index_queue(tenant,kind,object_id) VALUES(row_data->>'tenant',TG_ARGV[0],CASE WHEN TG_ARGV[0]='product' THEN row_data->>'product_id' ELSE (row_data->>'document_id')||':'||(row_data->>'position') END)
 ON CONFLICT(tenant,kind,object_id) DO UPDATE SET updated_at=now();
 RETURN NEW;
END $fn$;
CREATE TRIGGER semantic_index_outbox AFTER INSERT OR UPDATE OR DELETE ON semantic_products FOR EACH ROW EXECUTE FUNCTION queue_vector_index('product');
CREATE TRIGGER document_index_outbox AFTER INSERT OR UPDATE OR DELETE ON knowledge_chunks FOR EACH ROW EXECUTE FUNCTION queue_vector_index('document');
INSERT INTO vector_index_queue(tenant,kind,object_id) SELECT tenant,'product',product_id FROM semantic_products;
INSERT INTO vector_index_queue(tenant,kind,object_id) SELECT tenant,'document',document_id||':'||position FROM knowledge_chunks WHERE embedding IS NOT NULL;
