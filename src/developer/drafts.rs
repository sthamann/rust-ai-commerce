//! Actor-private, optimistic mutable autosaves; these never install or alter a published package.
use super::*;
fn actor(h: &RequestContext) -> String {
    h.principal
        .user
        .clone()
        .unwrap_or_else(|| hash(header(h, "authorization").unwrap_or("")))
}
pub(super) fn router() -> Router<App> {
    Router::new()
        .secure_route(
            "/api/developer/drafts",
            &[("GET", "apps.manage")],
            get(list),
        )
        .secure_route(
            "/api/developer/drafts/{id}",
            &[("PUT", "apps.manage"), ("DELETE", "apps.manage")],
            axum::routing::put(save).delete(remove),
        )
}
async fn list(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rows=sqlx::query("SELECT id,revision,manifest,environment,updated_at::text AS updated_at FROM developer_drafts WHERE tenant=$1 AND actor_key=$2 ORDER BY updated_at DESC LIMIT 20").bind(t).bind(actor(&h)).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"drafts":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"revision":r.get::<i64,_>("revision"),"manifest":r.get::<Value,_>("manifest"),"environment":r.get::<Option<String>,_>("environment"),"updatedAt":r.get::<String,_>("updated_at")})).collect::<Vec<_>>()}),
    ))
}
async fn save(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    if !apps::identifier(&id) || v["manifest"].to_string().len() > 65536 {
        return Err(bad("Draft identifier or 64 KiB budget invalid"));
    }
    let manifest: apps::Manifest = serde_json::from_value(v["manifest"].clone())
        .map_err(|_| bad("Draft must use the shared app contract"))?;
    if manifest.id != id {
        return Err(bad("Draft identity mismatch"));
    }
    let environment = v["environment"].as_str().filter(|s| !s.is_empty());
    let revision = v["revision"]
        .as_i64()
        .filter(|r| *r >= 0)
        .ok_or(bad("Draft revision required"))?;
    let owner = actor(&h);
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,821))")
        .bind(format!("{t}:{owner}"))
        .execute(&mut *tx)
        .await?;
    if let Some(stage) = environment
        && !sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM shop_environments WHERE live_tenant=$1 AND tenant=$2)",
        )
        .bind(&t)
        .bind(stage)
        .fetch_one(&mut *tx)
        .await?
    {
        return Err(bad("Draft sandbox does not belong to this shop"));
    }
    let current:Option<i64>=sqlx::query_scalar("SELECT revision FROM developer_drafts WHERE tenant=$1 AND actor_key=$2 AND id=$3 FOR UPDATE").bind(&t).bind(&owner).bind(&id).fetch_optional(&mut *tx).await?;
    if current.unwrap_or(0) != revision {
        return Err(conflict(
            "Draft changed in another window; reload before saving",
        ));
    }
    if current.is_none()
        && sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM developer_drafts WHERE tenant=$1 AND actor_key=$2",
        )
        .bind(&t)
        .bind(&owner)
        .fetch_one(&mut *tx)
        .await?
            >= 20
    {
        return Err(bad("Maximum 20 private drafts; remove an old draft"));
    }
    sqlx::query("INSERT INTO developer_drafts(tenant,actor_key,id,manifest,environment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,actor_key,id) DO UPDATE SET manifest=EXCLUDED.manifest,environment=EXCLUDED.environment,revision=developer_drafts.revision+1,updated_at=now()").bind(t).bind(owner).bind(&id).bind(v["manifest"].clone()).bind(environment).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id,"revision":revision+1})))
}
async fn remove(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    sqlx::query("DELETE FROM developer_drafts WHERE tenant=$1 AND actor_key=$2 AND id=$3")
        .bind(merchant(&a, &h)?)
        .bind(actor(&h))
        .bind(id)
        .execute(&a.db)
        .await?;
    Ok(Json(json!({"deleted":true})))
}
