-- Category descendants inherit product membership; channel filters apply before pagination.
WITH RECURSIVE tree AS (
 SELECT id FROM categories WHERE tenant=$1 AND id=$2 AND data->>'active'='true'
 UNION ALL SELECT c.id FROM categories c JOIN tree p ON c.parent_id=p.id
 WHERE c.tenant=$1 AND c.data->>'active'='true' AND coalesce((SELECT data->>'displayNestedProducts' FROM categories WHERE tenant=$1 AND id=$2),'true')='true'
)
SELECT p.* FROM products p
WHERE p.tenant=$1 AND p.parent_id IS NULL AND p.active AND NOT EXISTS(SELECT 1 FROM product_channel_visibility v WHERE v.tenant=p.tenant AND v.product_id=p.id AND v.channel_id=$8 AND NOT v.visible) AND p.id>$3
 AND ($4::text[] IS NULL OR p.id=ANY($4))
 AND EXISTS(SELECT 1 FROM product_categories pc JOIN tree t ON t.id=pc.category_id WHERE pc.tenant=p.tenant AND pc.product_id=p.id)
 AND ($5::text IS NULL OR lower(
   coalesce((SELECT tr.name FROM product_translations tr WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($6) AND tr.name IS NOT NULL ORDER BY array_position($6,tr.language_id) LIMIT 1),p.name)
   ||' '||coalesce((SELECT tr.description FROM product_translations tr WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND tr.language_id=ANY($6) AND tr.description IS NOT NULL ORDER BY array_position($6,tr.language_id) LIMIT 1),p.description)
 ) LIKE lower($5))
ORDER BY p.id LIMIT $7;
