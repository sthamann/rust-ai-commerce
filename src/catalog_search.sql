-- Each branch returns its first bounded set of effective-language matches.
-- Deduplication therefore handles at most twice the page size, even for a
-- common term that matches millions of products/translations.
SELECT DISTINCT ON (id) * FROM (
  (SELECT p.* FROM products p
   WHERE p.tenant=$1 AND p.parent_id IS NULL AND p.active AND NOT EXISTS(SELECT 1 FROM product_channel_visibility v WHERE v.tenant=p.tenant AND v.product_id=p.id AND v.channel_id=$8 AND NOT v.visible) AND p.id>$2
     AND ($3::text IS NULL OR p.category=$3)
     AND lower(p.name||' '||p.description) LIKE $7
     AND lower(
       coalesce((SELECT tr.name FROM product_translations tr
         WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($5)
           AND tr.name IS NOT NULL ORDER BY array_position($5,tr.language_id) LIMIT 1),p.name)
       ||' '||coalesce((SELECT tr.description FROM product_translations tr
         WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($5)
           AND tr.description IS NOT NULL ORDER BY array_position($5,tr.language_id) LIMIT 1),p.description)
     ) LIKE $4
   ORDER BY p.id LIMIT $6)
  UNION ALL
  -- Keep candidate IDs ordered and hydrate only candidates consumed by LIMIT.
  -- OFFSET 0 retains the lateral boundary: flattening it otherwise hydrates
  -- every translation hit before sorting a wide product row.
  (SELECT p.* FROM (
     SELECT DISTINCT ON (tr.product_id) tr.product_id FROM product_translations tr
     WHERE tr.tenant=$1 AND tr.language_id=ANY($5) AND tr.product_id>$2
       AND lower(coalesce(tr.name,'')||' '||coalesce(tr.description,'')) LIKE $7
     ORDER BY tr.product_id
   ) hits CROSS JOIN LATERAL (
     SELECT p.* FROM products p
   WHERE p.tenant=$1 AND p.parent_id IS NULL AND p.active AND NOT EXISTS(SELECT 1 FROM product_channel_visibility v WHERE v.tenant=p.tenant AND v.product_id=p.id AND v.channel_id=$8 AND NOT v.visible) AND p.id>$2
     AND ($3::text IS NULL OR p.category=$3)
     AND p.id=hits.product_id
     AND lower(
       coalesce((SELECT tr.name FROM product_translations tr
         WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($5)
           AND tr.name IS NOT NULL ORDER BY array_position($5,tr.language_id) LIMIT 1),p.name)
       ||' '||coalesce((SELECT tr.description FROM product_translations tr
         WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($5)
           AND tr.description IS NOT NULL ORDER BY array_position($5,tr.language_id) LIMIT 1),p.description)
     ) LIKE $4
     OFFSET 0
   ) p ORDER BY hits.product_id LIMIT $6)
) hits ORDER BY id LIMIT $6;
