-- Persisted quantities only; releasing twice yields no changes. Lock affected products in checkout's ID order.
WITH released AS (
 UPDATE order_inventory_reservations SET released_at=now()
 WHERE tenant=$1 AND order_id=$2 AND released_at IS NULL RETURNING product_id,quantity
), locked AS MATERIALIZED (
 SELECT p.id FROM products p JOIN released r ON r.product_id=p.id
 WHERE p.tenant=$1 ORDER BY p.id FOR UPDATE OF p
)
UPDATE products p SET stock=p.stock+r.quantity,revision=p.revision+1
FROM released r JOIN locked l ON l.id=r.product_id
WHERE p.tenant=$1 AND p.id=r.product_id;
