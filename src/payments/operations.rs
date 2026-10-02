//! Durable idempotent payment commands, customer context binding and serial refund admission.
use super::*;
pub(crate) async fn enqueue_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    id: &str,
    op: &str,
    key: &str,
    v: &Value,
) -> Result<String> {
    if key.len() < 8 || key.len() > 128 {
        return Err(bad("Idempotency-Key must contain 8..128 characters"));
    }
    let fingerprint = hash(&format!("{id}:{op}:{v}"));
    let job = hash(&format!("{t}:{key}"));
    sqlx::query("INSERT INTO payment_jobs(id,tenant,attempt_id,operation,request,fingerprint) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING").bind(&job).bind(t).bind(id).bind(op).bind(v).bind(&fingerprint).execute(&mut **tx).await?;
    let old: String =
        sqlx::query_scalar("SELECT fingerprint FROM payment_jobs WHERE tenant=$1 AND id=$2")
            .bind(t)
            .bind(&job)
            .fetch_one(&mut **tx)
            .await?;
    if old != fingerprint {
        return Err(conflict(
            "Payment idempotency key used for a different operation",
        ));
    }
    Ok(job)
}
pub(crate) async fn enqueue(
    a: &App,
    h: &HeaderMap,
    id: &str,
    op: &str,
    key: &str,
    v: &Value,
) -> Result<Value> {
    let t = tenant(h)?;
    let mut tx = a.db.begin().await?;
    let r = sqlx::query("SELECT * FROM payment_attempts WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(&t)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Payment not found".into()))?;
    let p = attempt(&r);
    // Existing operation retries return the original job, even after its terminal state.
    let job = hash(&format!("{t}:{key}"));
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM payment_jobs WHERE tenant=$1 AND id=$2)")
            .bind(&t)
            .bind(&job)
            .fetch_one(&mut *tx)
            .await?;
    if !exists {
        if op == "refund" {
            let amount = v["amountMinor"]
                .as_i64()
                .filter(|v| *v > 0)
                .ok_or(bad("Positive amountMinor required"))?;
            let reserved:i64=sqlx::query_scalar("SELECT coalesce(sum((request->>'amountMinor')::bigint),0)::bigint FROM payment_jobs WHERE tenant=$1 AND attempt_id=$2 AND operation='refund' AND state IN ('queued','running','uncertain')").bind(&t).bind(id).fetch_one(&mut *tx).await?;
            if !["captured", "partially_refunded"].contains(&p.state.as_str())
                || amount > p.amount - p.refunded - reserved
            {
                return Err(conflict("Refund exceeds the remaining captured amount"));
            }
        } else if !["pending", "ready", "approved"].contains(&p.state.as_str()) && op != "reconcile"
        {
            return Err(conflict("Payment is terminal"));
        }
    }
    let job = enqueue_tx(&mut tx, &t, id, op, key, v).await?;
    tx.commit().await?;
    Ok(json!({"jobId":job,"queued":true}))
}
pub(crate) async fn customer(a: &App, h: &HeaderMap, id: &str) -> Result<()> {
    let ok:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM payment_attempts p JOIN orders o ON o.id=p.order_id AND o.tenant=p.tenant JOIN carts c ON c.id=o.cart_id AND c.tenant=o.tenant WHERE p.tenant=$1 AND p.id=$2 AND c.token=$3)").bind(tenant(h)?).bind(id).bind(token(h)?).fetch_one(&a.db).await?;
    if !ok {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Payment not found in this customer context".into(),
        ));
    }
    Ok(())
}
