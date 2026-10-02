//! Merchant catalogue and Wasm extension activation/state.
use crate::*;

pub(crate) async fn admin_catalog(
    State(a): State<App>,
    h: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    catalog_request(State(a), h, body).await
}
pub(crate) async fn activate_extension(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let wat = v["wat"].as_str().ok_or(bad("wat required"))?.to_string();
    let source = wat.clone();
    let compiled = tokio::task::spawn_blocking(move || Sandbox::new(&source))
        .await
        .map_err(|e| bad(e.to_string()))?
        .map_err(bad)?;
    compiled.approve(0, 100_000).map_err(bad)?;
    let digest = hash(&wat);
    sqlx::query("INSERT INTO extensions(tenant,wat,digest) VALUES($1,$2,$3) ON CONFLICT(tenant) DO UPDATE SET wat=$2,digest=$3,revision=extensions.revision+1").bind(&t).bind(&wat).bind(&digest).execute(&a.db).await?;
    a.sandboxes.write().unwrap().insert(t, Arc::new(compiled));
    Ok(Json(
        json!({"activated":true,"digest":digest,"hook":"company.purchase.approve","fuel":10000,"memoryBytes":1048576,"hostImports":false}),
    ))
}

pub(crate) async fn extension_state(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let r = sqlx::query("SELECT digest,revision FROM extensions WHERE tenant=$1")
        .bind(t)
        .fetch_optional(&a.db)
        .await?;
    Ok(Json(match r {
        Some(r) => {
            json!({"digest":r.get::<String,_>("digest"),"revision":r.get::<i64,_>("revision"),"source":"persisted"})
        }
        None => json!({"source":"built-in"}),
    }))
}
