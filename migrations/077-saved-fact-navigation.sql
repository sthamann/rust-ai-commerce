-- Saved navigation predicates start from reviewed graph candidates, never a per-product model call.
CREATE INDEX knowledge_confirmed_query_type ON knowledge_relations(tenant,target_kind,confidence)
 WHERE kind='CLAIMS' AND state='confirmed';
CREATE INDEX knowledge_confirmed_query_text ON knowledge_relations USING gin(lower(data->>'text') gin_trgm_ops)
 WHERE kind='CLAIMS' AND state='confirmed';
