-- One ready tenant per batch; expired claims are retried, live claims never stolen.
WITH candidate AS (
 SELECT j.tenant FROM embedding_jobs j JOIN tenants t ON t.id=coalesce((SELECT live_tenant FROM shop_environments WHERE tenant=j.tenant),j.tenant)
 WHERE j.attempts<8 AND j.available_at<=now() AND (j.lease_until IS NULL OR j.lease_until<now()) AND t.status='active'
 ORDER BY j.available_at,j.tenant LIMIT 1
), picked AS (
 SELECT j.tenant,j.kind,j.object_id FROM embedding_jobs j JOIN candidate c ON c.tenant=j.tenant
 WHERE j.attempts<8 AND j.available_at<=now() AND (j.lease_until IS NULL OR j.lease_until<now())
 ORDER BY j.available_at,j.kind,j.object_id LIMIT 32 FOR UPDATE OF j SKIP LOCKED
)
UPDATE embedding_jobs j SET attempts=attempts+CASE WHEN j.lease IS NULL THEN 0 ELSE 1 END,lease=$1,lease_until=now()+interval '90 seconds'
FROM picked p WHERE j.tenant=p.tenant AND j.kind=p.kind AND j.object_id=p.object_id RETURNING j.*;
