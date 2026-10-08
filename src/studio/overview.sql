-- One bounded overview snapshot. Arrays retain the original limits and ordering; currencies remain separate.
WITH stats AS (
 SELECT count(*) AS orders,count(*) FILTER(WHERE created_at>=current_date) AS today
 FROM orders WHERE tenant=$1
), revenue AS (
 SELECT coalesce(data->'cart'->'price'->>'currency','EUR') AS currency,
 sum((data->'cart'->'price'->>'totalPrice')::numeric)::text AS amount
 FROM orders WHERE tenant=$1 GROUP BY 1 ORDER BY 1
), recent AS (
 SELECT data,created_at::text AS time FROM orders WHERE tenant=$1 ORDER BY created_at DESC LIMIT 8
), timeline AS (
 SELECT d::date::text AS day,count(o.id) AS orders,
 count(DISTINCT coalesce(o.data->'cart'->'price'->>'currency','EUR')) FILTER(WHERE o.id IS NOT NULL) AS currency_count,
 min(coalesce(o.data->'cart'->'price'->>'currency','EUR')) FILTER(WHERE o.id IS NOT NULL) AS currency,
 coalesce(sum((o.data->'cart'->'price'->>'totalPrice')::numeric),0)::text AS revenue
 FROM generate_series(current_date-6,current_date,interval '1 day') d
 LEFT JOIN orders o ON o.tenant=$1 AND o.created_at>=d AND o.created_at<d+interval '1 day' GROUP BY d ORDER BY d
), learning AS (
 SELECT d::date::text AS day,count(e.session) AS views,count(e.session) FILTER(WHERE e.rewarded) AS rewarded
 FROM generate_series(current_date-6,current_date,interval '1 day') d
 LEFT JOIN exposures e ON e.tenant=$1 AND e.created_at>=d AND e.created_at<d+interval '1 day' GROUP BY d ORDER BY d
), variants AS (
 SELECT variant,views,purchases FROM policy WHERE tenant=$1 ORDER BY variant
), indexed AS (
 SELECT count(*) AS count,max(updated_at)::text AS updated FROM semantic_products WHERE tenant=$1
), plans AS (
 SELECT count(*) FILTER(WHERE NOT applied AND (jsonb_array_length(proposal->'proposal'->'changes')>0
 OR proposal->'proposal'->'experience' IS NOT NULL AND proposal->'proposal'->'experience'<>'null'::jsonb)) AS pending,
 count(*) FILTER(WHERE applied) AS applied FROM tasks WHERE tenant=$1
), activity AS (
 SELECT kind,time::text AS time,id FROM (
 SELECT 'order' AS kind,created_at AS time,id FROM orders WHERE tenant=$1 UNION ALL
 SELECT CASE WHEN applied AND applied_at IS NOT NULL THEN 'approved' ELSE 'proposal' END AS kind,
 coalesce(applied_at,created_at) AS time,id FROM tasks WHERE tenant=$1
 ) a ORDER BY time DESC LIMIT 10
), channels AS (
 SELECT channel,calls,failures,last_seen::text AS last_seen FROM channel_metrics WHERE tenant=$1 ORDER BY channel
)
SELECT jsonb_build_object(
 'summary',jsonb_build_object('orders',stats.orders,'ordersToday',stats.today,'pendingPlans',plans.pending,'appliedPlans',plans.applied),
 'revenue',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM revenue r),'[]'::jsonb),
 'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',data->'id','number',data->'orderNumber',
 'total',data->'cart'->'price'->'totalPrice','currency',coalesce(data->'cart'->'price'->>'currency','EUR'),
 'channel',coalesce(data->'channel','"unknown"'::jsonb),'time',time,'payment','simulated')) FROM recent),'[]'::jsonb),
 'timeline',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM timeline r),'[]'::jsonb),
 'learningTimeline',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM learning r),'[]'::jsonb),
 'variants',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM variants r),'[]'::jsonb),
 'indexedProducts',indexed.count,'lastIndexed',indexed.updated,
 'activity',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM activity r),'[]'::jsonb),
 'channels',coalesce((SELECT jsonb_agg(jsonb_build_object('channel',channel,'calls',calls,'httpFailures',failures,'lastSeen',last_seen)) FROM channels),'[]'::jsonb)
) AS facts FROM stats CROSS JOIN plans CROSS JOIN indexed;
