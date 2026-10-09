-- Indexable candidate paths are combined before ranking; native tenant hydration still owns every hit.
WITH terms AS MATERIALIZED (SELECT unnest(tsvector_to_array(to_tsvector('simple',$2))) AS word), word_matches AS MATERIALIZED (
 SELECT l.product_id AS id FROM terms q JOIN knowledge_product_lexemes l ON l.tenant=$1 AND l.lexeme=q.word
 GROUP BY l.product_id HAVING count(*)=(SELECT count(*) FROM terms)
), candidates AS (
 SELECT p.id FROM word_matches m JOIN products p ON p.tenant=$1 AND p.id=m.id
 WHERE p.parent_id IS NULL AND to_tsvector('simple',p.name||' '||p.description) @@ plainto_tsquery('simple',$2)
 UNION
 SELECT id FROM products WHERE tenant=$1 AND parent_id IS NULL AND id=$2
 UNION
 SELECT p.id FROM knowledge_relations r JOIN products p ON p.tenant=r.tenant AND p.id=r.source_id
 WHERE r.tenant=$1 AND r.kind='SERVES' AND r.target_id=lower($2) AND p.parent_id IS NULL
), lexical AS (
 SELECT p.id,row_number() OVER(ORDER BY (p.id=$2) DESC,
 ts_rank_cd(to_tsvector('simple',p.name||' '||p.description),plainto_tsquery('simple',$2)) DESC,p.id) AS rank
 FROM candidates c JOIN products p ON p.tenant=$1 AND p.id=c.id AND p.parent_id IS NULL
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
