-- Bounded explicit channel IDs, with effective-language search before pagination.
SELECT p.* FROM products p WHERE p.tenant=$1 AND p.parent_id IS NULL
AND p.id=ANY($2) AND p.id>$3 AND ($4::text IS NULL OR p.category=$4)
AND ($6::text IS NULL OR lower(
 coalesce((SELECT tr.name FROM product_translations tr WHERE tr.tenant=p.tenant
 AND tr.product_id=p.id AND tr.language_id=ANY($5) AND tr.name IS NOT NULL
 ORDER BY array_position($5,tr.language_id) LIMIT 1),p.name)
 ||' '||coalesce((SELECT tr.description FROM product_translations tr WHERE tr.tenant=p.tenant
 AND tr.product_id=p.id AND tr.language_id=ANY($5) AND tr.description IS NOT NULL
 ORDER BY array_position($5,tr.language_id) LIMIT 1),p.description)) LIKE $6)
ORDER BY p.id LIMIT $7;
