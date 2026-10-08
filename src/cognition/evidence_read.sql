-- Current source/language and visibility remain authoritative, even after a claim was reviewed.
SELECT jsonb_build_object('id',r.target_id,'productId',r.source_id,'revision',r.revision,'state',r.state,
 'confidence',r.confidence,'validFrom',r.valid_from,'validUntil',r.valid_until,'recordedFrom',r.recorded_from,
 'sourcePublic',d.visibility='public','validTime',r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()),
 'actor',CASE WHEN $3 THEN NULL ELSE r.actor END,'data',r.data,
 'sourceCurrent',d.content_hash=r.data->>'contentHash' AND d.revision=(r.data->>'sourceRevision')::bigint AND NOT d.archived)
FROM knowledge_relations r JOIN knowledge_documents d ON d.tenant=r.tenant AND d.id=r.data->>'sourceId'
JOIN products p ON p.tenant=r.tenant AND p.id=r.source_id
WHERE r.tenant=$1 AND r.kind='CLAIMS' AND r.source_id=$2 AND (NOT $3 OR (
 r.state='confirmed' AND d.visibility='public' AND NOT d.archived AND d.content_hash=r.data->>'contentHash'
 AND d.revision=(r.data->>'sourceRevision')::bigint AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())))
ORDER BY r.recorded_from DESC,r.target_id LIMIT 100;
