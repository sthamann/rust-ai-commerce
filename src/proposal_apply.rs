//! Transactional application of approved, revision-bound proposals.
use crate::*;

pub(crate) async fn apply(a: &App, t: &str, id: &str) -> Result<Value> {
    let mut tx = a.db.begin().await?;
    let r = sqlx::query("SELECT * FROM tasks WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(t)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Task not found".into()))?;
    if r.get::<bool, _>("applied") {
        return Ok(json!({"taskId":id,"applied":true,"replayed":true}));
    }
    let v: Value = r.get("proposal");
    let p: Proposal =
        serde_json::from_value(v["proposal"].clone()).map_err(|e| bad(e.to_string()))?;
    for c in p.changes {
        let product_id = c.product_id.clone();
        let n=sqlx::query("UPDATE products SET price=COALESCE($1,price),stock=COALESCE($2,stock),revision=revision+1 WHERE tenant=$3 AND id=$4 AND revision=$5").bind(c.price).bind(c.stock).bind(t).bind(c.product_id).bind(c.expected_revision).execute(&mut *tx).await?.rows_affected();
        if n != 1 {
            return Err(conflict("Product changed since preview; create a new plan"));
        }
        let row = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
            .bind(t)
            .bind(product_id)
            .fetch_one(&mut *tx)
            .await?;
        knowledge::sync_product(&mut tx, t, &serde_json::to_value(product(&row)).unwrap()).await?;
    }
    if let Some(e) = p.experience {
        let n = sqlx::query(
            "UPDATE experiences SET data=$1,revision=revision+1 WHERE tenant=$2 AND revision=$3",
        )
        .bind(e)
        .bind(t)
        .bind(p.expected_experience_revision)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if n != 1 {
            return Err(conflict("Experience changed since preview"));
        }
    }
    sqlx::query("UPDATE tasks SET applied=true,applied_at=now() WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'merchant.change.applied',$2)")
        .bind(t)
        .bind(json!({"taskId":id}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(json!({"taskId":id,"applied":true}))
}
