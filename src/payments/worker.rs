//! Leased payment jobs; network runs after claim commit, fenced receipts prevent duplicate local effects.
use super::*;
pub(crate) async fn payment_once(a: &App) -> Result<()> {
    let configured: Value =
        serde_json::from_str(&env::var("PAYPAL_SANDBOX_ACCOUNTS").unwrap_or("{}".into()))
            .map_err(|_| bad("Invalid account configuration"))?;
    let tenants = configured
        .as_object()
        .map(|v| {
            v.keys()
                .filter(|t| account(t).is_ok())
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if tenants.is_empty() {
        return Ok(());
    }
    let mut tx = a.db.begin().await?;
    let row=sqlx::query("SELECT j.* FROM payment_jobs j JOIN payment_attempts p ON p.id=j.attempt_id WHERE j.tenant=ANY($1) AND j.available_at<=now() AND (j.state='queued' OR j.state='running' AND j.lease_until<now()) AND NOT EXISTS(SELECT 1 FROM payment_jobs other WHERE other.attempt_id=j.attempt_id AND other.id<>j.id AND other.state='running' AND other.lease_until>now()) ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j,p SKIP LOCKED").bind(&tenants).fetch_optional(&mut *tx).await?;
    let Some(job) = row else {
        tx.commit().await?;
        return expire_one(a, &tenants).await;
    };
    let id = job.get::<String, _>("id");
    let op = job.get::<String, _>("operation");
    let input = job.get::<Value, _>("request");
    let generation = job.get::<i32, _>("attempts") + 1;
    sqlx::query("UPDATE payment_jobs SET state='running',attempts=$1,lease_until=now()+interval '60 seconds' WHERE id=$2").bind(generation).bind(&id).execute(&mut *tx).await?;
    let row = sqlx::query("SELECT * FROM payment_attempts WHERE id=$1")
        .bind(job.get::<String, _>("attempt_id"))
        .fetch_one(&mut *tx)
        .await?;
    let p = attempt(&row);
    tx.commit().await?;
    let outcome =
        if op == "capture" && !["ready", "approved", "captured"].contains(&p.state.as_str()) {
            Err(conflict("Payment cannot be captured in this state"))
        } else if op == "cancel" {
            if p.provider_order.is_some() {
                dispatch(a, &p, "reconcile", &id, &input).await
            } else {
                Ok(json!({"notCreated":true}))
            }
        } else {
            dispatch(a, &p, &op, &id, &input).await
        };
    let mut tx = a.db.begin().await?;
    // Every receipt re-reads the authoritative attempt and claims its job generation.
    let fence = sqlx::query("SELECT state,attempts FROM payment_jobs WHERE id=$1 FOR UPDATE")
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;
    if fence.get::<String, _>("state") != "running" || fence.get::<i32, _>("attempts") != generation
    {
        return Ok(());
    }
    let row = sqlx::query("SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE")
        .bind(&p.id)
        .fetch_one(&mut *tx)
        .await?;
    let current = attempt(&row);
    match outcome {
        Ok(v) => {
            // SAVEPOINT keeps a rejected/malformed remote receipt from partially mutating local state.
            sqlx::query("SAVEPOINT receipt").execute(&mut *tx).await?;
            let result = if op == "cancel" && v["status"] != "COMPLETED" {
                let validation = if v["notCreated"] == true {
                    Ok(())
                } else {
                    paypal::validate_order(&current, &v)
                };
                if let Err(e) = validation {
                    Err(e)
                } else {
                    release_stock(
                        &mut tx,
                        &current,
                        if input["expiry"] == true {
                            "expired"
                        } else {
                            "cancelled"
                        },
                    )
                    .await
                }
            } else {
                persist(&mut tx, &current, &op, &input, &v).await
            };
            if let Err(e) = result {
                sqlx::query("ROLLBACK TO SAVEPOINT receipt")
                    .execute(&mut *tx)
                    .await?;
                sqlx::query("UPDATE payment_jobs SET state='uncertain',error=$1,lease_until=NULL WHERE id=$2").bind(e.1).bind(&id).execute(&mut *tx).await?;
            } else {
                sqlx::query("UPDATE payment_jobs SET state='succeeded',response=$1,error=NULL,lease_until=NULL WHERE id=$2").bind(v).bind(&id).execute(&mut *tx).await?;
            }
        }
        Err(e) => {
            let terminal = generation >= 8 || e.0 == StatusCode::CONFLICT;
            sqlx::query("UPDATE payment_jobs SET state=$1,error=$2,lease_until=NULL,available_at=now()+interval '2 seconds' WHERE id=$3").bind(if terminal{if e.0==StatusCode::CONFLICT{"failed"}else{"uncertain"}}else{"queued"}).bind(e.1).bind(&id).execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;
    Ok(())
}
async fn expire_one(a: &App, tenants: &[String]) -> Result<()> {
    // An uncertain provider operation requires reconciliation, never automatic inventory release.
    let mut tx = a.db.begin().await?;
    let row=sqlx::query("SELECT * FROM payment_attempts p WHERE tenant=ANY($1) AND expires_at<now() AND state IN ('pending','ready','approved') AND NOT EXISTS(SELECT 1 FROM payment_jobs j WHERE j.attempt_id=p.id AND j.state IN ('queued','running','uncertain')) ORDER BY expires_at LIMIT 1 FOR UPDATE SKIP LOCKED").bind(tenants).fetch_optional(&mut *tx).await?;
    if let Some(r) = row {
        let p = attempt(&r);
        enqueue_tx(
            &mut tx,
            &p.tenant,
            &p.id,
            "cancel",
            &format!("{}:expiry", p.id),
            &json!({"expiry":true}),
        )
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
