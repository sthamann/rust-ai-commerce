//! Operator-only inference administration: optimistic revision, encrypted write-only keys and audit without secrets.
use super::*;
use vendune::inference::settings;
pub(super) async fn get(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    auth::actor(&h)?;
    snapshot(&a).await.map(Json)
}
async fn snapshot(a: &App) -> Result<Value> {
    let row = sqlx::query(
        "SELECT revision,data,secrets,updated_at::text AS updated FROM platform_ai WHERE id=true",
    )
    .fetch_one(&a.db)
    .await?;
    let secrets: Value = row.get("secrets");
    let stored: Value = row.get("data");
    let mut visible = a.inference.environment_configuration();
    if let Some(provider) = stored.get("defaultProvider") {
        visible["defaultProvider"] = provider.clone();
    }
    for id in ["ollama", "openai", "anthropic"] {
        if let Some(provider) = stored["providers"].get(id) {
            visible["providers"][id] = provider.clone();
        }
    }
    Ok(
        json!({"revision":row.get::<i64,_>("revision"),"settings":visible,
        "updatedAt":row.get::<String,_>("updated"),"encryptedStorageReady":settings::encryption_ready(),
        "keyStored":{"ollama":secrets.get("ollama").is_some(),"openai":secrets.get("openai").is_some(),"anthropic":secrets.get("anthropic").is_some()},
        "effective":a.inference.public_providers().await.ok(),"inheritance":"all tenants; replica refresh within 5 seconds"}),
    )
}
pub(super) async fn save(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let actor = auth::actor(&h)?;
    let provider = v["settings"]["defaultProvider"]
        .as_str()
        .filter(|v| ["ollama", "openai", "anthropic"].contains(v))
        .ok_or(bad("Choose a supported default provider"))?;
    let mut data = json!({"defaultProvider":provider,"providers":{}});
    for id in ["ollama", "openai", "anthropic"] {
        let row = &v["settings"]["providers"][id];
        let model = row["model"]
            .as_str()
            .filter(|s| {
                !s.is_empty() && s.len() <= 128 && s.is_ascii() && !s.chars().any(char::is_control)
            })
            .ok_or(bad("Invalid model identifier"))?;
        let endpoint = row["endpoint"]
            .as_str()
            .filter(|s| {
                settings::valid_endpoint(s)
                    || a.inference.environment_configuration()["providers"][id]["endpoint"].as_str()
                        == Some(s)
            })
            .ok_or(bad(
                "Provider endpoint must be HTTPS without credentials, query or fragment",
            ))?;
        let enabled = row["enabled"]
            .as_bool()
            .ok_or(bad("Provider enabled state required"))?;
        if id == provider && !enabled {
            return Err(bad("The default provider must be enabled"));
        }
        data["providers"][id] =
            json!({"model":model,"endpoint":endpoint.trim_end_matches('/'),"enabled":enabled});
    }
    let mut tx = a.db.begin().await?;
    let row = sqlx::query("SELECT revision,secrets FROM platform_ai WHERE id=true FOR UPDATE")
        .fetch_one(&mut *tx)
        .await?;
    if !verified_kernel::revision_admissible(
        v["revision"]
            .as_u64()
            .filter(|r| *r > 0)
            .ok_or(bad("Positive revision required"))?,
        row.get::<i64, _>("revision") as u64,
    ) {
        return Err(conflict("AI configuration changed; reload before saving"));
    }
    let mut secrets: Value = row.get("secrets");
    for id in ["ollama", "openai", "anthropic"] {
        if v["clearKeys"][id].as_bool() == Some(true) {
            secrets.as_object_mut().unwrap().remove(id);
        }
        if let Some(key) = v["keys"][id].as_str().filter(|s| !s.is_empty()) {
            if key.len() > 4096 || key.chars().any(char::is_control) {
                return Err(bad("Invalid provider key"));
            }
            secrets[id] = json!(settings::seal(id, key).map_err(bad)?);
        }
    }
    sqlx::query("UPDATE platform_ai SET revision=revision+1,data=$1,secrets=$2,updated_by=$3,updated_at=now() WHERE id=true").bind(data).bind(secrets).bind(actor).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO platform_audit(actor,action,data) VALUES($1,'ai.updated',$2)")
        .bind(actor)
        .bind(json!({"defaultProvider":provider}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    a.inference.invalidate().await;
    snapshot(&a).await.map(Json)
}
