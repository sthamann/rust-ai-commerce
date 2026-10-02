-- Each branch returns its first bounded set of effective-language matches.
-- Deduplication therefore handles at most twice the page size, even for a
-- common term that matches millions of products/translations.
SELECT DISTINCT ON (id) * FROM (
  (SELECT p.* FROM products p
   WHERE p.tenant=$1 AND p.parent_id IS NULL AND p.id>$2
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
  (SELECT p.* FROM products p
   WHERE p.tenant=$1 AND p.parent_id IS NULL AND p.id>$2
     AND ($3::text IS NULL OR p.category=$3)
     AND p.id IN (SELECT tr.product_id FROM product_translations tr
       WHERE tr.tenant=$1 AND tr.language_id=ANY($5)
         AND lower(coalesce(tr.name,'')||' '||coalesce(tr.description,'')) LIKE $7)
     AND lower(
       coalesce((SELECT tr.name FROM product_translations tr
         WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($5)
           AND tr.name IS NOT NULL ORDER BY array_position($5,tr.language_id) LIMIT 1),p.name)
       ||' '||coalesce((SELECT tr.description FROM product_translations tr
         WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($5)
           AND tr.description IS NOT NULL ORDER BY array_position($5,tr.language_id) LIMIT 1),p.description)
     ) LIKE $4
   ORDER BY p.id LIMIT $6)
) hits ORDER BY id LIMIT $6;
