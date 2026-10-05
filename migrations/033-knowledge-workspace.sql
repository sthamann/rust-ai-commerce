-- Source lifecycle, enabled-language content and deterministic retrieval provenance.
ALTER TABLE knowledge_documents ADD COLUMN kind text NOT NULL DEFAULT 'document';
ALTER TABLE knowledge_documents ADD COLUMN locale text NOT NULL DEFAULT 'en-GB';
ALTER TABLE knowledge_documents ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';
ALTER TABLE knowledge_documents ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE knowledge_chunks ADD COLUMN locale text NOT NULL DEFAULT '';
CREATE INDEX knowledge_documents_workspace ON knowledge_documents(tenant,archived,id);
CREATE INDEX knowledge_chunks_language ON knowledge_chunks(tenant,document_id,locale);
