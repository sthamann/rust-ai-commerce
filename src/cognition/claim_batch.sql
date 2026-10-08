-- One bounded read retains the evidence ledger's current/public/valid-time admission; no historical claim cache.
SELECT claim FROM (
 SELECT jsonb_build_object('id',r.target_id,'productId',r.source_id,'text',r.data->>'text',
  'locale',r.data->>'locale','sourceId',d.id,'contentHash',d.content_hash) AS claim,
 row_number() OVER(PARTITION BY r.source_id ORDER BY r.recorded_from DESC,r.target_id) AS n
 FROM knowledge_relations r JOIN knowledge_documents d ON d.tenant=r.tenant AND d.id=r.data->>'sourceId'
 WHERE r.tenant=$1 AND r.source_id=ANY($2) AND r.kind='CLAIMS' AND r.state='confirmed'
 AND d.visibility='public' AND NOT d.archived AND d.content_hash=r.data->>'contentHash'
 AND d.revision=(r.data->>'sourceRevision')::bigint AND r.data->>'locale'=$3
 AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
) ranked WHERE n<=20 ORDER BY claim->>'productId',n LIMIT 480;
