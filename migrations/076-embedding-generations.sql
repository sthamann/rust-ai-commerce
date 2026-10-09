-- Durable keyset cursors rebuild every tenant after a configured embedding-model change.
-- Source-change triggers remain responsible for concurrent edits and newly inserted rows.
CREATE TABLE embedding_generations (
 tenant text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 model text NOT NULL CHECK(length(model) BETWEEN 1 AND 256),
 phase text NOT NULL DEFAULT 'product' CHECK(phase IN ('product','document','complete')),
 cursor text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX embedding_generations_pending ON embedding_generations(model,tenant) WHERE phase<>'complete';
ALTER TABLE embedding_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON embedding_generations
 USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''))
 WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
-- Separate expression index makes document keyset pagination independent of catalog size.
CREATE INDEX cognitive_chunk_keyset ON knowledge_chunks(tenant,(document_id||':'||position));
