//! Revisioned aliases point to an existing tenant-owned Experience; origin selection remains operator-only.
use crate::*;
pub(super) async fn list(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    auth::permit(&h, "settings.read")?;
    Ok(Json(
        json!({"frontends":apps::hosted::connections(&a,&tenant(&h)?).await?}),
    ))
}
pub(super) async fn bind(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.write")?;
    let t = tenant(&h)?;
    let alias = v["alias"]
        .as_str()
        .ok_or(bad("Frontend address required"))?;
    validate_tenant(alias)?;
    if [
        "app",
        "www",
        "api",
        "admin",
        "mail",
        "platform",
        "experience",
    ]
    .contains(&alias)
    {
        return Err(bad("Reserved address"));
    }
    let channel = v["channel"]
        .as_str()
        .filter(|s| apps::identifier(s))
        .ok_or(bad("Channel required"))?;
    let requested_app = v["appId"].as_str();
    if v.get("appId").is_some() && requested_app != Some("storyfront") {
        return Err(bad("Unknown hosted app"));
    }
    let mut app_id = requested_app.map(str::to_owned);
    let experience = v["experienceAlias"].as_str().unwrap_or(alias);
    validate_tenant(experience)?;
    let origin = env::var("HOSTED_FRONTEND_ORIGIN").map_err(|_| {
        Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Hosted frontend service is not configured".into(),
        )
    })?;
    if !super::frontends::valid_origin(&origin) {
        return Err(bad("Operator frontend origin is invalid"));
    }
    let mut tx = a.db.begin().await?;
    crate::marketing::lock_config(&mut tx, &t).await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,43))")
        .bind(alias)
        .execute(&mut *tx)
        .await?;
    let occupied: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1 AND id<>$2)")
            .bind(alias)
            .bind(&t)
            .fetch_one(&mut *tx)
            .await?;
    if occupied {
        return Err(conflict("Address belongs to another shop"));
    }
    let available: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sales_channels WHERE tenant=$1 AND id=$2)")
            .bind(&t)
            .bind(channel)
            .fetch_one(&mut *tx)
            .await?;
    if !available {
        return Err(bad("Channel required in this shop"));
    }
    // Additional domains can only select an Experience already mounted by this same tenant.
    if experience != alias {
        let own = sqlx::query(
            "SELECT app_id FROM hosted_frontends WHERE tenant=$1 AND experience_alias=$2 ORDER BY alias LIMIT 1",
        )
        .bind(&t)
        .bind(experience)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(own) = own else {
            return Err(bad("Experience is not connected to this shop"));
        };
        if app_id.is_none() {
            app_id = own.get("app_id");
        }
    }
    let row=sqlx::query("SELECT tenant,channel,experience_alias,revision,app_id FROM hosted_frontends WHERE alias=$1 FOR UPDATE").bind(alias).fetch_optional(&mut *tx).await?;
    if let Some(row) = &row {
        if row.get::<String, _>("tenant") != t {
            return Err(conflict("Address belongs to another shop"));
        }
        if app_id.is_none() {
            app_id = row.get("app_id");
        }
        let unchanged = row.get::<String, _>("channel") == channel
            && row.get::<String, _>("experience_alias") == experience
            && row.get::<Option<String>, _>("app_id") == app_id;
        if !unchanged && v["revision"].as_i64() != Some(row.get("revision")) {
            return Err(conflict("Frontend revision changed"));
        }
        if unchanged {
            if let Some(id) = &app_id {
                apps::hosted::ensure(&mut tx, &t, id).await?;
            }
            tx.commit().await?;
            return Ok(Json(
                json!({"alias":alias,"channel":channel,"revision":row.get::<i64,_>("revision"),"urls":super::links(alias)}),
            ));
        }
    } else if v["revision"].as_i64().is_some_and(|r| r != 0) {
        return Err(conflict("Frontend revision changed"));
    }
    if let Some(id) = &app_id {
        apps::hosted::ensure(&mut tx, &t, id).await?;
    }
    let revision:i64=sqlx::query_scalar("INSERT INTO hosted_frontends(alias,tenant,channel,origin,experience_alias,app_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(alias) DO UPDATE SET channel=excluded.channel,origin=excluded.origin,experience_alias=excluded.experience_alias,app_id=excluded.app_id,revision=hosted_frontends.revision+1 WHERE hosted_frontends.tenant=excluded.tenant RETURNING revision")
        .bind(alias).bind(&t).bind(channel).bind(origin).bind(experience).bind(&app_id).fetch_one(&mut *tx).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'frontend.configured',$2)").bind(&t).bind(json!({"alias":alias,"channel":channel,"revision":revision,"actor":header(&h,"x-rac-user")})).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(
        json!({"alias":alias,"channel":channel,"revision":revision,"urls":super::links(alias)}),
    ))
}
pub(super) async fn remove(
    State(a): State<App>,
    h: RequestContext,
    Path(alias): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.write")?;
    let t = tenant(&h)?;
    let revision = v["revision"]
        .as_i64()
        .ok_or(bad("Frontend revision required"))?;
    let mut tx = a.db.begin().await?;
    crate::marketing::lock_config(&mut tx, &t).await?;
    let n =
        sqlx::query("DELETE FROM hosted_frontends WHERE tenant=$1 AND alias=$2 AND revision=$3")
            .bind(&t)
            .bind(&alias)
            .bind(revision)
            .execute(&mut *tx)
            .await?
            .rows_affected();
    if n == 0 {
        return Err(conflict("Frontend absent or revision changed"));
    }
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'frontend.disconnected',$2)")
        .bind(&t)
        .bind(json!({"alias":alias,"actor":header(&h,"x-rac-user")}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"disconnected":true,"alias":alias})))
}
