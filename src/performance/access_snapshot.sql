-- Per-request MVCC snapshot; never cached between requests. Hosted bindings cannot be replaced by headers.
WITH mount AS (
 SELECT tenant,channel,origin,experience_alias FROM hosted_frontends WHERE alias=$1
), selected AS (
 SELECT coalesce((SELECT tenant FROM mount),$2) AS tenant,
        coalesce((SELECT channel FROM mount),$3) AS channel
)
SELECT s.tenant,s.channel,e.live_tenant AS parent,t.status,
 EXISTS(SELECT 1 FROM tenants WHERE id=s.tenant) AS exists,
 c.data AS channel_data,c.revision AS channel_revision,m.origin,m.experience_alias
FROM selected s
LEFT JOIN shop_environments e ON e.tenant=s.tenant
LEFT JOIN tenants t ON t.id=coalesce(e.live_tenant,s.tenant)
LEFT JOIN sales_channels c ON c.tenant=s.tenant AND c.id=s.channel
LEFT JOIN mount m ON true;
