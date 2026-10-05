-- Source-bound shop knowledge; draft/private records never enter customer retrieval.
SET search_path=public;
CREATE TABLE IF NOT EXISTS knowledge_documents (
 tenant text NOT NULL, id text NOT NULL, product_id text, title text NOT NULL,
 content_hash text NOT NULL, content text NOT NULL, visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
 source_type text NOT NULL, revision bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id), FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id),
 UNIQUE NULLS NOT DISTINCT(tenant,product_id,content_hash)
);
CREATE TABLE IF NOT EXISTS knowledge_chunks (
 tenant text NOT NULL,document_id text NOT NULL,position integer NOT NULL,text text NOT NULL,
 embedding real[] CHECK(embedding IS NULL OR cardinality(embedding)=1024),embedding_model text,
 PRIMARY KEY(tenant,document_id,position),FOREIGN KEY(tenant,document_id) REFERENCES knowledge_documents(tenant,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS knowledge_chunk_search ON knowledge_chunks USING gin(to_tsvector('simple',text));
