-- Reciprocal-rank fusion keeps lexical/exact-ID evidence even when dense results exist.
WITH lexical AS (
 SELECT p.id,row_number() OVER(ORDER BY (p.id=$2) DESC,
 ts_rank_cd(to_tsvector('simple',p.name||' '||p.description),plainto_tsquery('simple',$2)) DESC,p.id) AS rank
 FROM products p WHERE p.tenant=$1 AND p.parent_id IS NULL AND (
 p.id=$2 OR to_tsvector('simple',p.name||' '||p.description) @@ plainto_tsquery('simple',$2)
 OR EXISTS(SELECT 1 FROM knowledge_relations r WHERE r.tenant=p.tenant AND r.source_id=p.id AND r.kind='SERVES' AND r.target_id=lower($2)))
 ORDER BY rank LIMIT 64
), dense AS (
 SELECT p.id,c.rank FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY AS c(hit,rank)
 JOIN semantic_products s ON s.tenant=$1 AND s.product_id=c.hit->'payload'->>'object_id'
 AND s.embedding_model=$4 AND s.content_hash=c.hit->'payload'->>'digest'
 JOIN products p ON p.tenant=s.tenant AND p.id=s.product_id AND p.parent_id IS NULL
 WHERE c.hit->'payload'->>'tenant'=$1 AND c.hit->'payload'->>'model'=$4
 AND NOT EXISTS(SELECT 1 FROM embedding_jobs j WHERE j.tenant=p.tenant AND j.kind='product' AND j.object_id=p.id)
 LIMIT 64
), ranks AS (
 SELECT id,sum(1.0/(60+rank)) AS score FROM (SELECT * FROM lexical UNION ALL SELECT * FROM dense) r GROUP BY id
)
SELECT jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'currency',
 coalesce(p.extra->>'priceCurrency',(SELECT data->'currencies'->>'pricingCurrency' FROM commerce_settings WHERE tenant=$1),'EUR'),
 'stock',p.stock,'revision',p.revision,'score',r.score)
FROM ranks r JOIN products p ON p.tenant=$1 AND p.id=r.id ORDER BY r.score DESC,p.id LIMIT 24;
