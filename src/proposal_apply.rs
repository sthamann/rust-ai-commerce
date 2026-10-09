//! Transactional application of approved, revision-bound proposals.
use crate::*;

pub(crate) async fn apply(a: &App, t: &str, id: &str, h: &RequestContext) -> Result<Value> {
    apply_mode(a, t, id, h, false).await
}
pub(crate) async fn apply_mode(
    a: &App,
    t: &str,
    id: &str,
    h: &RequestContext,
    autonomous: bool,
) -> Result<Value> {
    let mut tx = a.db.begin().await?;
    history::context(
        &mut tx,
        h,
        if autonomous {
            "agent-autonomy"
        } else {
            "merchant"
        },
    )
    .await?;
    let r = sqlx::query("SELECT * FROM tasks WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(t)
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Task not found".into()))?;
    let v: Value = r.get("proposal");
    let p: Proposal =
        serde_json::from_value(v["proposal"].clone()).map_err(|e| bad(e.to_string()))?;
    if !p.changes.is_empty() {
        auth::permit(h, "catalog.write")?;
    }
    if p.experience.is_some() {
        auth::permit(h, "catalog.write")?;
    }
    if autonomous {
        auth::permit(h, "catalog.write")?;
        auth::permit(h, "settings.write")?;
    }
    if r.get::<bool, _>("applied") {
        return Ok(json!({"taskId":id,"applied":true,"replayed":true}));
    }
    let settings_row =
        sqlx::query("SELECT data,revision FROM commerce_settings WHERE tenant=$1 FOR UPDATE")
            .bind(t)
            .fetch_one(&mut *tx)
            .await?;
    let settings: commerce::Settings = serde_json::from_value(settings_row.get("data"))
        .map_err(|_| bad("Invalid commerce settings"))?;
    if let Some(revision) = v["policyRevision"].as_i64()
        && revision != settings_row.get::<i64, _>("revision")
    {
        return Err(conflict(
            "Merchant guardrails/settings changed after preview",
        ));
    }
    let ids = p
        .changes
        .iter()
        .map(|c| c.product_id.clone())
        .collect::<Vec<_>>();
    let products =
        sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=ANY($2) ORDER BY id FOR UPDATE")
            .bind(t)
            .bind(ids)
            .fetch_all(&mut *tx)
            .await?
            .iter()
            .map(product)
            .collect::<Vec<_>>();
    validate_proposal(&p, &products)?;
    for c in &p.changes {
        cognition::guardrails::check(
            &settings,
            products
                .iter()
                .find(|p| p.id == c.product_id)
                .ok_or(bad("Unknown product"))?,
            c,
            false,
        )?;
    }
    if autonomous {
        cognition::autonomy::reserve(&mut tx, t, id, h, &settings, &p, &products).await?;
    }
    if let Some(change) = &p.app_action {
        apps::apply_change(&mut tx, t, change, h).await?;
    }
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
    sqlx::query("UPDATE tasks SET applied=true,applied_at=now() WHERE tenant=$2 AND id=$1")
        .bind(id)
        .bind(t)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'merchant.change.applied',$2)")
        .bind(t)
        .bind(json!({"taskId":id,"autonomous":autonomous,"actor":header(h,"x-rac-user")}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(json!({"taskId":id,"applied":true}))
}
