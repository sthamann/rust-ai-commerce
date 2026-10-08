-- Two-hop product neighborhood; only currently confirmed public claims enter a buyer-facing inference context.
WITH RECURSIVE connected(id,depth) AS (
 SELECT unnest($2::text[]),0
 UNION
 SELECT CASE WHEN r.source_id=c.id THEN r.target_id ELSE r.source_id END,c.depth+1
 FROM connected c JOIN LATERAL (SELECT * FROM knowledge_relations r WHERE r.tenant=$1 AND r.kind='PAIRS_WITH'
 AND (r.source_id=c.id OR r.target_id=c.id) AND r.state='confirmed'
 AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) ORDER BY r.source_id,r.target_id LIMIT 8) r ON true
 WHERE c.depth<2
), bounded AS (SELECT DISTINCT id FROM connected ORDER BY id LIMIT 48)
SELECT jsonb_build_object('kind',r.kind,'sourceId',r.source_id,'targetId',r.target_id,'evidence',r.data)
FROM knowledge_relations r LEFT JOIN knowledge_documents d ON d.tenant=r.tenant AND d.id=r.data->>'sourceId'
WHERE r.tenant=$1 AND r.state='confirmed' AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
AND (r.source_id IN(SELECT id FROM bounded) OR r.target_id IN(SELECT id FROM bounded))
AND (r.kind IN('SERVES','PAIRS_WITH') OR (r.kind='CLAIMS' AND d.visibility='public' AND NOT d.archived
 AND d.content_hash=r.data->>'contentHash' AND d.revision=(r.data->>'sourceRevision')::bigint))
ORDER BY CASE WHEN r.kind='CLAIMS' THEN 0 ELSE 1 END,r.source_id,r.target_id LIMIT 48;
