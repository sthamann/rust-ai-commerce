-- Static assignments and saved current-public-fact queries share category/channel pagination.
WITH RECURSIVE tree AS (
 SELECT id,data FROM categories WHERE tenant=$1 AND id=$2 AND data->>'active'='true'
 UNION ALL SELECT c.id,c.data FROM categories c JOIN tree p ON c.parent_id=p.id
 WHERE c.tenant=$1 AND c.data->>'active'='true' AND coalesce((SELECT data->>'displayNestedProducts' FROM categories WHERE tenant=$1 AND id=$2),'true')='true'
), queries AS (
 SELECT t.data->'graphQuery' AS q, chosen.locale, chosen.text FROM tree t
 CROSS JOIN LATERAL (
  SELECT locale,text FROM (VALUES
   (0,$9::text,coalesce(t.data#>>ARRAY['graphQuery','text',$9],t.data#>>ARRAY['graphQuery','text',split_part($9,'-',1)])),
   (1,$10::text,coalesce(t.data#>>ARRAY['graphQuery','text',$10],t.data#>>ARRAY['graphQuery','text',split_part($10,'-',1)]))
  ) AS v(priority,locale,text) WHERE text IS NOT NULL ORDER BY priority LIMIT 1
 ) chosen WHERE t.data->>'type'='page' AND length(chosen.text)>=3
), membership AS (
 SELECT pc.product_id FROM product_categories pc JOIN tree t ON t.id=pc.category_id WHERE pc.tenant=$1
 UNION
 SELECT r.source_id FROM queries q JOIN knowledge_relations r ON r.tenant=$1 AND r.kind='CLAIMS' AND r.state='confirmed'
  AND r.target_kind=q.q->>'nodeType' AND r.confidence>=(q.q->>'minimumConfidence')::numeric
  AND lower(r.data->>'text') LIKE '%'||replace(replace(replace(lower(q.text),'\','\\'),'%','\%'),'_','\_')||'%'
  AND r.data->>'locale'=q.locale AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
 JOIN knowledge_documents d ON d.tenant=r.tenant AND d.id=r.data->>'sourceId'
  AND d.visibility='public' AND NOT d.archived AND d.content_hash=r.data->>'contentHash'
  AND d.revision=(r.data->>'sourceRevision')::bigint AND (d.product_id IS NULL OR d.product_id=r.source_id)
)
SELECT p.* FROM products p
WHERE p.tenant=$1 AND p.parent_id IS NULL AND p.active AND NOT EXISTS(SELECT 1 FROM product_channel_visibility v WHERE v.tenant=p.tenant AND v.product_id=p.id AND v.channel_id=$8 AND NOT v.visible) AND p.id>$3
 AND ($4::text[] IS NULL OR p.id=ANY($4))
 AND p.id IN (SELECT product_id FROM membership)
 AND ($5::text IS NULL OR lower(
   coalesce((SELECT tr.name FROM product_translations tr WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($6) AND tr.name IS NOT NULL ORDER BY array_position($6,tr.language_id) LIMIT 1),p.name)
   ||' '||coalesce((SELECT tr.description FROM product_translations tr WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($6) AND tr.description IS NOT NULL ORDER BY array_position($6,tr.language_id) LIMIT 1),p.description)
 ) LIKE lower($5))
ORDER BY p.id LIMIT $7;
