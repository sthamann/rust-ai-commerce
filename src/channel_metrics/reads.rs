//! One persisted diagnostic read shared by operator overview, shop dossiers and infrastructure.
use crate::*;

pub(crate) async fn traffic(
    db: &PgPool,
    tenant: Option<&str>,
    exclude_staging: bool,
) -> Result<Vec<Value>> {
    // Status codes are a fixed, bounded vocabulary. Legacy totals are deliberately not guessed.
    let rows = sqlx::query("WITH scoped AS (SELECT * FROM channel_metrics m WHERE ($1::text IS NULL OR m.tenant=$1) AND (NOT $2 OR NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=m.tenant))), statuses AS (SELECT channel,key,sum(value::bigint) AS n FROM scoped CROSS JOIN LATERAL jsonb_each_text(response_counts) GROUP BY channel,key), codes AS (SELECT channel,jsonb_object_agg(key,n) AS responses FROM statuses GROUP BY channel) SELECT s.channel,sum(calls)::bigint AS calls,sum(failures)::bigint AS failures,sum(total_ms)::bigint AS total_ms,max(max_ms) AS max_ms,sum(timed_calls)::bigint AS timed_calls,max(last_seen)::text AS seen,coalesce(c.responses,'{}'::jsonb) AS responses FROM scoped s LEFT JOIN codes c USING(channel) GROUP BY s.channel,c.responses ORDER BY s.channel")
        .bind(tenant).bind(exclude_staging).fetch_all(db).await?;
    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "channel":r.get::<String,_>("channel"), "calls":r.get::<i64,_>("calls"),
                "failures":r.get::<i64,_>("failures"), "timedCalls":r.get::<i64,_>("timed_calls"),
                "totalMs":r.get::<i64,_>("total_ms"), "maxMs":r.get::<i64,_>("max_ms"),
                "lastSeen":r.get::<String,_>("seen"), "responses":r.get::<Value,_>("responses")
            })
        })
        .collect())
}
