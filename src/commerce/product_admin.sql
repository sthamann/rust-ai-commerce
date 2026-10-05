-- Search/filter before cursor pagination; correlated family count uses product_family index.
SELECT p.*, (SELECT count(*) FROM products c WHERE c.tenant=p.tenant AND c.parent_id=p.id) AS variant_count, ARRAY(SELECT pc.category_id FROM product_categories pc WHERE pc.tenant=p.tenant AND pc.product_id=p.id ORDER BY pc.category_id) AS category_ids
FROM products p WHERE p.tenant=$1 AND p.id>$2
 AND ($3::bool IS NULL OR p.active=$3)
 AND ($4::text IS NULL OR lower(p.name) LIKE lower($4) OR lower(p.product_number) LIKE lower($4) OR EXISTS(SELECT 1 FROM product_translations tr WHERE tr.tenant=p.tenant AND tr.product_id=p.id AND lower(coalesce(tr.name,'')) LIKE lower($4)))
 AND ($5::text IS NULL OR EXISTS(SELECT 1 FROM product_categories pc WHERE pc.tenant=p.tenant AND pc.product_id=p.id AND pc.category_id=$5))
 AND (($6::text IS NULL AND p.parent_id IS NULL) OR p.parent_id=$6)
 AND (NOT $7 OR p.stock<=5)
ORDER BY p.id LIMIT $8;
