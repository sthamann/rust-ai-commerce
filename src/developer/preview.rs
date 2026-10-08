//! F5 runs the shared native app runtime in an actor-private expiring staging clone; no build/version/release is created.
use super::*;
pub(super) fn router() -> Router<App> {
    Router::new().secure_route(
        "/api/developer/preview",
        &[("POST", "apps.manage")],
        post(run),
    )
}
async fn run(
    State(a): State<App>,
    h: RequestContext,
    Json(mut v): Json<Value>,
) -> Result<Json<Value>> {
    let t = staging::live(&a, &h).await?;
    let actor = h
        .principal
        .user
        .as_deref()
        .filter(|v| *v != "bootstrap")
        .ok_or(bad("Personal preview needs a personal session"))?;
    if v["manifest"].to_string().len() > 65536 {
        return Err(bad("Preview app exceeds 64 KiB"));
    }
    routes::actions(&mut v["manifest"])?;
    let m: apps::Manifest =
        serde_json::from_value(v["manifest"].clone()).map_err(|e| bad(e.to_string()))?;
    builds::validate(&m)?;
    if m.runtime != "declarative"
        || !m.schedules.is_empty()
        || !m.events.is_empty()
        || m.payment_provider.is_some()
    {
        return Err(bad(
            "Immediate preview runs native apps only; external services, schedules and payments require reviewed staging",
        ));
    }
    apps::actor_permissions(&h, &m)?;
    let _lease = crate::performance::cluster_lease::Lease::acquire(
        &a,
        &t,
        &format!("app-preview:{actor}"),
        1,
    )
    .await?;
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT tenant FROM shop_environments WHERE live_tenant=$1 AND preview_owner=$2",
    )
    .bind(&t)
    .bind(actor)
    .fetch_optional(&a.db)
    .await?;
    let environment = if let Some(id) = existing {
        id
    } else {
        auth::permit(&h, "settings.write")?;
        staging::create_preview(a.clone(), h.clone(), "App Studio", actor)
            .await?
            .0["id"]
            .as_str()
            .unwrap()
            .to_owned()
    };
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT tenant FROM shop_environments WHERE tenant=$1 AND live_tenant=$2 AND preview_owner=$3 FOR UPDATE").bind(&environment).bind(&t).bind(actor).fetch_one(&mut *tx).await?;
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM app_packages WHERE tenant=$1 AND id<>$2")
            .bind(&environment)
            .bind(&m.id)
            .fetch_one(&mut *tx)
            .await?;
    if count >= 20 {
        return Err(bad(
            "Personal preview supports at most 20 apps; reuse the current app ID",
        ));
    }
    // A changed data model starts with empty preview records; view-only hot reload preserves them.
    let previous: Option<Value> =
        sqlx::query_scalar("SELECT manifest FROM app_packages WHERE tenant=$1 AND id=$2")
            .bind(&environment)
            .bind(&m.id)
            .fetch_optional(&mut *tx)
            .await?;
    if let Some(value) = previous {
        let old: apps::Manifest =
            serde_json::from_value(value).map_err(|_| bad("Invalid previous preview"))?;
        if old.entities != m.entities {
            apps::drop_preview_relations(&mut tx, &environment, &old).await?;
            for entity in &old.entities {
                let ddl = format!(
                    "DROP TABLE IF EXISTS public.{} CASCADE",
                    apps::table(&environment, &m.id, &entity.name)
                );
                sqlx::raw_sql(sqlx::AssertSqlSafe(ddl.as_str()))
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }
    let result = apps::install_preview(&mut tx, &environment, m).await?;
    sqlx::query(
        "UPDATE shop_environments SET preview_until=now()+interval '1 hour' WHERE tenant=$1",
    )
    .bind(&environment)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"environment":environment,"app":result["id"],"version":result["version"],"digest":result["digest"],"private":true,"expiresInSeconds":3600,"releaseAllowed":false}),
    ))
}
