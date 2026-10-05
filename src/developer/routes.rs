//! Developer HTTP transport and coding-agent task export; explicit staging precedes live release.
use super::*;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/api/developer", get(list))
        .route("/api/developer/schema", get(schema))
        .route("/api/developer/generate", post(generate))
        .route("/api/developer/import", post(import))
        .route("/api/developer/builds/{id}/stage", post(stage))
        .route("/api/developer/task", post(task))
}
async fn schema(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    auth::permit(&h, "users")?;
    let t = staging::live(&a, &h).await?;
    let (settings, _) = commerce::config(&a, &t).await?;
    Ok(Json(generation::schema_for(&settings.locales)))
}
pub(crate) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = staging::live(&a, &h).await?;
    let (settings, _) = commerce::config(&a, &t).await?;
    let rows=sqlx::query("SELECT id,environment,app,version,digest,manifest,summary,state,provider,model,created_at FROM developer_builds WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(&t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"builds":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"environment":r.get::<String,_>("environment"),"app":r.get::<String,_>("app"),"version":r.get::<String,_>("version"),"digest":r.get::<String,_>("digest"),"manifest":r.get::<Value,_>("manifest"),"summary":r.get::<Value,_>("summary"),"state":r.get::<String,_>("state"),"provider":r.get::<String,_>("provider"),"model":r.get::<Option<String>,_>("model")})).collect::<Vec<_>>(),"mainLocale":settings.main_locale,"locales":settings.locales,"providers":a.inference.providers(),"codingAgents":[{"id":"codex","transport":"mcp + task export"},{"id":"claude_code","transport":"mcp + task export"}],"runtime":"declarative native data/API/UI; arbitrary service code requires an external build"}),
    ))
}
async fn generate(State(a): State<App>, h: HeaderMap, Json(v): Json<Value>) -> Result<Json<Value>> {
    auth::permit(&h, "users")?;
    let t = staging::live(&a, &h).await?;
    Ok(Json(generation::generate(&a, &t, &h, &v).await?))
}

pub(super) fn actions(m: &mut Value) -> Result<()> {
    if m.get("actions").is_some() {
        return Ok(());
    }
    let mut list = vec![];
    for e in m["entities"].as_array().ok_or(bad("Entities required"))? {
        let name = e["name"].as_str().ok_or(bad("Entity name required"))?;
        list.push(json!({"name":format!("list_{}",name.chars().take(27).collect::<String>()),"description":format!("List {name}"),"handler":"list","entity":name,"public":e["publicRead"]==true,"inputSchema":{"type":"object","properties":{"limit":{"type":"integer"},"after":{"type":"string"}},"additionalProperties":false}}));
        list.push(json!({"name":format!("save_{}",name.chars().take(27).collect::<String>()),"description":format!("Save {name}"),"handler":"save","entity":name,"public":false,"flowAllowed":true,"inputSchema":{"type":"object","properties":{"id":{"type":"string"},"revision":{"type":"integer"},"fields":{"type":"object"}},"required":["id","fields"],"additionalProperties":false}}));
    }
    m["actions"] = json!(list);
    Ok(())
}
pub(crate) async fn import(
    State(a): State<App>,
    h: HeaderMap,
    Json(mut v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "users")?;
    let t = staging::live(&a, &h).await?;
    actions(&mut v["manifest"])?;
    Ok(Json(
        builds::save(&a, &t, &v, "external-agent", None).await?,
    ))
}
pub(crate) async fn stage(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "users")?;
    let t = staging::live(&a, &h).await?;
    if v["approve"] != true {
        return Err(bad("Approve the reviewed build first"));
    }
    let mut tx = a.db.begin().await?;
    let row=sqlx::query("SELECT environment,manifest,digest FROM developer_builds WHERE tenant=$1 AND id=$2 FOR UPDATE").bind(&t).bind(&id).fetch_optional(&mut *tx).await?.ok_or(Error(StatusCode::NOT_FOUND,"Build unavailable".into()))?;
    if v["digest"] != row.get::<String, _>("digest") {
        return Err(conflict("Build digest changed"));
    }
    let env: String = row.get("environment");
    staging::owned(&a, &t, &env).await?;
    let m: apps::Manifest =
        serde_json::from_value(row.get("manifest")).map_err(|_| bad("Invalid app"))?;
    builds::validate(&m)?;
    let result = apps::install_tx(&mut tx, &env, m).await?;
    sqlx::query("UPDATE developer_builds SET state='staged' WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(result))
}
pub(crate) async fn task(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "users")?;
    let t = staging::live(&a, &h).await?;
    let env = v["environment"]
        .as_str()
        .ok_or(bad("Environment required"))?;
    staging::owned(&a, &t, env).await?;
    let prompt = v["prompt"]
        .as_str()
        .filter(|s| s.len() <= 8000)
        .ok_or(bad("Prompt required"))?;
    if v.get("manifest")
        .is_some_and(|m| m.to_string().len() > 65536)
    {
        return Err(bad("Current app definition exceeds the task context limit"));
    }
    let origin =
        env::var("COMMERCE_PUBLIC_ORIGIN").unwrap_or_else(|_| "http://127.0.0.1:8787".into());
    let url = reqwest::Url::parse(&origin).map_err(|_| bad("Invalid public commerce origin"))?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !(url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(bad("Invalid public commerce origin"));
    }
    let (settings, _) = commerce::config(&a, &t).await?;
    Ok(Json(
        json!({"task":format!("Build a versioned Rust Commerce app. Requirements: {prompt}\nTarget private sandbox: {env}. Localize labels and content using the enabled shop languages in appSchema; missing non-main translations inherit the shop main language. Read the appSchema and installed GET /api/apps examples returned with this task. Return a versioned manifest via POST /api/developer/import with environment, prompt, summary and manifest. Stage via POST /api/developer/builds/{{id}}/stage with approve=true and digest. Test data/API/UI in the sandbox. Never publish to live without a merchant's explicit selected release. The visual editor and coding agents share one Manifest IR: entities/actions/views/surfaces/apiRoutes/intelligence. Native views bind text/table/cards/form blocks to entity list/save actions; uiPath=native/{{view_id}}; save actions may opt into Flow Builder via flowAllowed. Preserve existing data schemas, bump semantic versions, use the currentManifest as the editing baseline. Service packages can declare surfaces, apiRoutes and intelligence in the exported extensionContract. Deploy their versioned frontend/backend separately with resource limits; only an operator can register APP_SERVICES. Staging disables external service calls."),"appSchema":generation::schema_for(&settings.locales),"extensionContract":{"example":"extensions/apps/product-lab/manifest.json","guide":"docs/app-platform.md","runtime":"declarative or operator-deployed service","surfaces":["admin.navigation","admin.product","admin.order","storefront.page","storefront.home","storefront.header","product.detail","cart.summary","account.overview"],"apiRoutes":"GET/POST route -> declared action with admin/storefront scope","intelligence":"localized description + selected tools and entities","sdk":"extensions/sdk/browser.js"},"mcpEndpoint":"/mcp","mcpConfig":{"mcpServers":{"rust-commerce-dev":{"command":"python3","args":["scripts/mcp_stdio.py"],"env":{"COMMERCE_URL":url.origin().ascii_serialization(),"COMMERCE_TENANT":t,"COMMERCE_SESSION_TOKEN":"<personal session token; store locally only>"}}}},"credentials":"Use your personal merchant session. Export does not include credentials. Run this MCP configuration from your local repository checkout; the helper is client-side.","currentManifest":v["manifest"],"agent":v["agent"]}),
    ))
}
