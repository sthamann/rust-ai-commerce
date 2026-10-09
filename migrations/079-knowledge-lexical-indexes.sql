-- Rebuildable lexical candidate indexes. Native rows own content, ranking and visibility.
-- B-tree text equality is leakproof; PostgreSQL FTS operators are not, so ordinary
-- forced-RLS roles cannot reliably push the historic GIN predicate below the policy.
-- Block concurrent source writes during the one-time backfill and trigger installation.
LOCK TABLE products,knowledge_chunks IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE knowledge_product_lexemes (
 tenant text NOT NULL,product_id text NOT NULL,lexeme text NOT NULL,
 PRIMARY KEY(tenant,lexeme,product_id),
 FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id) ON DELETE CASCADE
);
CREATE INDEX knowledge_product_lexemes_source ON knowledge_product_lexemes(tenant,product_id);
CREATE TABLE knowledge_chunk_lexemes (
 tenant text NOT NULL,document_id text NOT NULL,position integer NOT NULL,lexeme text NOT NULL,
 PRIMARY KEY(tenant,lexeme,document_id,position),
 FOREIGN KEY(tenant,document_id,position) REFERENCES knowledge_chunks(tenant,document_id,position) ON DELETE CASCADE
);
CREATE INDEX knowledge_chunk_lexemes_source ON knowledge_chunk_lexemes(tenant,document_id,position);
INSERT INTO knowledge_product_lexemes
 SELECT p.tenant,p.id,word FROM products p CROSS JOIN LATERAL unnest(tsvector_to_array(to_tsvector('simple',p.name||' '||p.description))) word;
INSERT INTO knowledge_chunk_lexemes
 SELECT c.tenant,c.document_id,c.position,word FROM knowledge_chunks c CROSS JOIN LATERAL unnest(tsvector_to_array(to_tsvector('simple',c.text))) word;
CREATE FUNCTION knowledge_product_words() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.name=NEW.name AND OLD.description=NEW.description THEN RETURN NULL; END IF;
 DELETE FROM knowledge_product_lexemes WHERE tenant=NEW.tenant AND product_id=NEW.id;
 INSERT INTO knowledge_product_lexemes SELECT NEW.tenant,NEW.id,word
 FROM unnest(tsvector_to_array(to_tsvector('simple',NEW.name||' '||NEW.description))) word;
 RETURN NULL;
END $$;
CREATE TRIGGER knowledge_product_words_changed AFTER INSERT OR UPDATE OF name,description ON products
 FOR EACH ROW EXECUTE FUNCTION knowledge_product_words();
CREATE FUNCTION knowledge_chunk_words() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.text=NEW.text THEN RETURN NULL; END IF;
 DELETE FROM knowledge_chunk_lexemes WHERE tenant=NEW.tenant AND document_id=NEW.document_id AND position=NEW.position;
 INSERT INTO knowledge_chunk_lexemes SELECT NEW.tenant,NEW.document_id,NEW.position,word
 FROM unnest(tsvector_to_array(to_tsvector('simple',NEW.text))) word;
 RETURN NULL;
END $$;
CREATE TRIGGER knowledge_chunk_words_changed AFTER INSERT OR UPDATE OF text ON knowledge_chunks
 FOR EACH ROW EXECUTE FUNCTION knowledge_chunk_words();
ALTER TABLE knowledge_product_lexemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_product_lexemes FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON knowledge_product_lexemes
 USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''))
 WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
ALTER TABLE knowledge_chunk_lexemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunk_lexemes FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON knowledge_chunk_lexemes
 USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''))
 WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
CREATE INDEX knowledge_serves_target ON knowledge_relations(tenant,target_id,source_id) WHERE kind='SERVES';
