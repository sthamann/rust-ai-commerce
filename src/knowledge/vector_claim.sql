-- Lease and commit before external Qdrant calls; changed sources retain their newer queue revision.
WITH picked AS (
 SELECT tenant,kind,object_id FROM vector_index_queue q
 WHERE available_at<=now() AND (lease_until IS NULL OR lease_until<now())
 AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=coalesce((SELECT live_tenant FROM shop_environments WHERE tenant=q.tenant),q.tenant) AND t.status='active')
 ORDER BY available_at,tenant,kind,object_id LIMIT 16 FOR UPDATE SKIP LOCKED
)
UPDATE vector_index_queue q SET lease=$1,lease_until=now()+interval '180 seconds'
FROM picked p WHERE q.tenant=p.tenant AND q.kind=p.kind AND q.object_id=p.object_id RETURNING q.*;
