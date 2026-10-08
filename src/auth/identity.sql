-- One authoritative snapshot: credential, all active grants, selected environment and current shop status.
WITH credential AS (
 SELECT user_id,default_tenant,scopes FROM (
  SELECT user_id,default_tenant,NULL::jsonb AS scopes,0 AS priority FROM user_sessions WHERE digest=$1 AND expires_at>now()
  UNION ALL SELECT user_id,tenant,permissions,1 FROM integration_keys WHERE digest=$1 AND expires_at>now()
 ) c ORDER BY priority LIMIT 1
), members AS (
 SELECT tenant,role,permissions FROM memberships WHERE user_id=(SELECT user_id FROM credential) AND active
), chosen AS (
 SELECT coalesce($2,CASE WHEN EXISTS(SELECT 1 FROM members WHERE tenant=c.default_tenant) THEN c.default_tenant ELSE (SELECT min(tenant) FROM members) END) AS tenant FROM credential c
), scope AS (
 SELECT chosen.tenant,e.live_tenant AS parent FROM chosen LEFT JOIN shop_environments e ON e.tenant=chosen.tenant
)
SELECT c.user_id,c.default_tenant,c.scopes,s.tenant,s.parent,t.status,
 coalesce((SELECT jsonb_agg(jsonb_build_object('tenant',tenant,'role',role,'permissions',permissions)) FROM members),'[]'::jsonb) AS memberships
FROM credential c CROSS JOIN scope s LEFT JOIN tenants t ON t.id=coalesce(s.parent,s.tenant);
