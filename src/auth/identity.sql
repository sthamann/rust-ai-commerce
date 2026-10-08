-- One authoritative snapshot: credential, all active grants, selected environment and current shop status.
WITH credential AS (
 SELECT user_id,default_tenant,scopes,app_id,app_permissions FROM (
  SELECT user_id,default_tenant,NULL::jsonb AS scopes,NULL::text AS app_id,NULL::jsonb AS app_permissions,0 AS priority FROM user_sessions WHERE digest=$1 AND expires_at>now()
  UNION ALL SELECT i.user_id,i.tenant,i.permissions,i.app_id,i.app_permissions,1 FROM integration_keys i
  LEFT JOIN app_packages p ON p.tenant=i.tenant AND p.id=i.app_id
  WHERE i.digest=$1 AND i.expires_at>now() AND (i.app_id IS NULL OR (p.active AND p.digest=i.package_digest))
 ) c ORDER BY priority LIMIT 1
), members AS (
 SELECT tenant,role,permissions FROM memberships WHERE user_id=(SELECT user_id FROM credential) AND active
), chosen AS (
 SELECT coalesce($2,CASE WHEN EXISTS(SELECT 1 FROM members WHERE tenant=c.default_tenant) THEN c.default_tenant ELSE (SELECT min(tenant) FROM members) END) AS tenant FROM credential c
), scope AS (
 SELECT chosen.tenant,e.live_tenant AS parent,e.preview_owner,e.preview_until>now() AS preview_valid FROM chosen LEFT JOIN shop_environments e ON e.tenant=chosen.tenant
)
SELECT c.user_id,c.default_tenant,c.scopes,c.app_id,c.app_permissions,s.tenant,s.parent,s.preview_owner,s.preview_valid,t.status,ch.data AS channel_data,ch.revision AS channel_revision,
 coalesce((SELECT jsonb_agg(jsonb_build_object('tenant',tenant,'role',role,'permissions',permissions)) FROM members),'[]'::jsonb) AS memberships
FROM credential c CROSS JOIN scope s LEFT JOIN tenants t ON t.id=coalesce(s.parent,s.tenant)
LEFT JOIN sales_channels ch ON ch.tenant=s.tenant AND ch.id=$3;
