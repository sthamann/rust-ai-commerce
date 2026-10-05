-- Atomic read snapshot: deletion/recreation and unchanged revision numbers cannot reuse an old UUID.
WITH scope AS (
    SELECT s.revision, s.data, o.data AS patch,
           s.cache_version::text || ':' || coalesce(o.cache_version::text, '-') AS version,
           ($2 = 'default' OR c.id IS NOT NULL) AS channel_exists
    FROM commerce_settings s
    LEFT JOIN sales_channels c ON c.tenant=s.tenant AND c.id=$2
    LEFT JOIN commerce_overrides o ON o.tenant=s.tenant AND o.channel_id=$2 AND $2 <> 'default'
    WHERE s.tenant=$1
)
SELECT revision, version, channel_exists,
       CASE WHEN version IS DISTINCT FROM $3 THEN data END AS data,
       CASE WHEN version IS DISTINCT FROM $3 THEN patch END AS patch
FROM scope
