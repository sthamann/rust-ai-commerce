-- Preserve legacy totals while recording exact HTTP error statuses from this release onward.
ALTER TABLE channel_metrics ADD COLUMN response_counts jsonb NOT NULL DEFAULT '{}';
-- The vocabulary is limited to 400..599, never routes, IDs, headers, payloads or query strings.
CREATE FUNCTION vendune_merge_http_counts(a jsonb, b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_object_agg(key,n),'{}'::jsonb)
 FROM (SELECT key,sum(value::bigint) AS n
       FROM (SELECT * FROM jsonb_each_text(a) UNION ALL SELECT * FROM jsonb_each_text(b)) v
       WHERE key ~ '^[45][0-9]{2}$' GROUP BY key) totals
$$;
