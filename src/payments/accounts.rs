//! Merchant-authorized onboarding bridge; only authenticated provider responses establish account bindings.
use super::*;
pub(crate) async fn onboarding(a: &App, h: &HeaderMap, id: &str, input: &Value) -> Result<Value> {
    let t = merchant(a, h)?;
    auth::permit(h, "payments.manage")?;
    let m = apps::package(a, &t, id, true).await?;
    if m.payment_provider.is_none() {
        return Err(bad("App has no payment provider contract"));
    }
    let op = input["operation"].as_str().unwrap_or("status");
    if !["status", "start", "disconnect"].contains(&op)
        || (op != "status" && input["approve"] != true)
    {
        return Err(bad("Supported onboarding operation and approval required"));
    }
    let channel = input["channel"].as_str().unwrap_or("default");
    let owned: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sales_channels WHERE tenant=$1 AND id=$2)")
            .bind(&t)
            .bind(channel)
            .fetch_one(&a.db)
            .await?;
    if !owned {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Sales channel not found".into(),
        ));
    }
    let all: Value = serde_json::from_str(&env::var("PAYMENT_SERVICES").unwrap_or("{}".into()))
        .map_err(|_| bad("Invalid payment service configuration"))?;
    let configured = &all[id][&m.version];
    let environment = input["environment"]
        .as_str()
        .or_else(|| configured["defaultEnvironment"].as_str())
        .or_else(|| configured["environment"].as_str())
        .ok_or(Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Payment service not configured".into(),
        ))?;
    let key = input["requestKey"]
        .as_str()
        .filter(|v| v.len() >= 8 && v.len() <= 128)
        .ok_or(bad("Onboarding requestKey required"))?;
    let body = json!({"apiVersion":"1","provider":id,"adapterVersion":m.version,"tenant":t,"channel":channel,"environment":environment,"operation":op,"requestKey":key,"country":input["country"]});
    let result = remote::call(a, &t, id, &m.version, environment, "onboarding", &body).await?;
    if result["apiVersion"] != "1"
        || result["adapterVersion"] != m.version
        || result["tenant"] != t
        || result["provider"] != id
        || result["environment"] != environment
        || result["channel"] != channel
    {
        return Err(bad("Onboarding account identity mismatch"));
    }
    let account = result["accountRef"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 200)
        .ok_or(bad("Provider account reference missing"))?;
    let ready = result["ready"]
        .as_bool()
        .ok_or(bad("Provider account readiness missing"))?;

    // No arbitrary service payload or credential is returned to merchant/model callers.
    let mut response = json!({"provider":id,"channel":channel,"accountRef":account,"ready":ready,"environment":environment,"status":result["status"]});
    if let Some(url) = result["onboardingUrl"].as_str() {
        let p = Attempt {
            id: "".into(),
            provider: id.into(),
            context: json!({}),
            tenant: t.clone(),
            order: "".into(),
            amount: 0,
            currency: "EUR".into(),
            state: "".into(),
            provider_order: None,
            capture: None,
            refunded: 0,
            adapter_version: m.version.clone(),
            environment: environment.into(),
            bn_code: "".into(),
        };
        response["onboardingUrl"] = json!(remote::approval_url(&p, &json!(url))?);
    }
    let methods = result["methods"]
        .as_array()
        .filter(|ms| {
            ms.len() <= 32
                && ms.iter().all(|v| {
                    v.as_str().is_some_and(|id| {
                        m.payment_provider
                            .as_ref()
                            .unwrap()
                            .methods
                            .iter()
                            .any(|method| method.id == id)
                    })
                })
        })
        .ok_or(bad("Provider enabled-method list required"))?;
    if ready && methods.is_empty() {
        return Err(bad("Ready account requires enabled methods"));
    }
    response["methods"] = json!(methods);
    let mut tx = a.db.begin().await?;
    // A concurrent uninstall/version change must not activate an obsolete account contract.
    let current: bool = sqlx::query_scalar(
        "SELECT active FROM app_packages WHERE tenant=$1 AND id=$2 AND version=$3 FOR SHARE",
    )
    .bind(&t)
    .bind(id)
    .bind(&m.version)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or(false);
    if !current {
        return Err(conflict("Payment package changed during onboarding"));
    }
    let public = json!({"accountRef":account,"ready":ready,"environment":environment,"methods":methods,"status":result["status"]});
    sqlx::query("INSERT INTO payment_provider_accounts(tenant,app,channel,account_ref,environment,ready,data) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant,app,channel) DO UPDATE SET account_ref=EXCLUDED.account_ref,environment=EXCLUDED.environment,ready=EXCLUDED.ready,data=EXCLUDED.data,updated_at=now()").bind(&t).bind(id).bind(channel).bind(account).bind(environment).bind(ready).bind(public).execute(&mut *tx).await?;

    tx.commit().await?;
    Ok(response)
}
pub(crate) async fn onboarding_route(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    Ok(Json(onboarding(&a, &h, &id, &v).await?))
}
pub(crate) async fn providers_route(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "payments.read")?;
    let rows=sqlx::query("SELECT id,version,active,manifest->'paymentProvider' AS contract FROM app_packages WHERE tenant=$1 AND manifest ? 'paymentProvider' ORDER BY id").bind(&t).fetch_all(&a.db).await?;
    let accounts=sqlx::query("SELECT app,channel,account_ref,environment,ready,updated_at::text FROM payment_provider_accounts WHERE tenant=$1 ORDER BY app,channel").bind(&t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"apiVersion":"1","providers":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"version":r.get::<String,_>("version"),"active":r.get::<bool,_>("active"),"contract":r.get::<Value,_>("contract")})).collect::<Vec<_>>(),"accounts":accounts.iter().map(|r|json!({"provider":r.get::<String,_>("app"),"channel":r.get::<String,_>("channel"),"accountRef":r.get::<String,_>("account_ref"),"environment":r.get::<String,_>("environment"),"ready":r.get::<bool,_>("ready"),"updatedAt":r.get::<String,_>("updated_at")})).collect::<Vec<_>>() }),
    ))
}

/// Generation and coding agents use the same private account action contract.
pub(crate) fn onboarding_action() -> Value {
    json!({"name":"onboarding","description":"Manage payment provider account","handler":"payment_onboarding","public":false,"permission":"payments.manage","mcp":true,"flowAllowed":false,"inputSchema":{"type":"object","properties":{"operation":{"type":"string","enum":["start","status","disconnect"]},"channel":{"type":"string"},"environment":{"type":"string","enum":["sandbox","live","contract-fixture"]},"country":{"type":"string"},"requestKey":{"type":"string"},"approve":{"type":"boolean"}},"required":["operation","requestKey"],"additionalProperties":false}})
}
