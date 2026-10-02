//! Shared HTTP/MCP capability dispatch and tool authorization.
use crate::*;

pub(crate) const CAPABILITIES: &[(&str, &str)] = &[
    ("catalog.search", "Read catalog"),
    (
        "catalog.detail",
        "Read SKU family, media, properties, approved reviews and context prices",
    ),
    (
        "checkout.options",
        "Read available shipping and payment methods",
    ),
    (
        "checkout.select",
        "Update country, delivery address, shipping and payment with cart revision",
    ),
    (
        "knowledge.graph",
        "Read tenant product needs and complementary relationships",
    ),
    (
        "knowledge.search",
        "Semantic product retrieval with live price/stock and graph evidence",
    ),
    ("cart.create", "Create customer cart"),
    (
        "cart.replace",
        "Replace cart items using optimistic revision",
    ),
    ("cart.quote", "Calculate authoritative cart"),
    (
        "checkout.complete",
        "Place order with simulated/manual payment and Idempotency-Key",
    ),
    (
        "merchant.plan",
        "Create real LLM change preview; merchant authorization required",
    ),
    (
        "merchant.apply",
        "Approve stored change; merchant authorization required",
    ),
    (
        "merchant.orders",
        "Read orders; merchant authorization required",
    ),
];
pub(crate) async fn capabilities() -> Json<Value> {
    Json(
        json!({"capabilities":CAPABILITIES.iter().map(|(n,d)|json!({"name":n,"description":d})).collect::<Vec<_>>()}),
    )
}
pub(crate) async fn invoke(a: &App, h: &HeaderMap, name: &str, v: &Value) -> Result<Value> {
    if let Some(app) = name.strip_prefix("app.") {
        let (id, action) = app
            .split_once('.')
            .ok_or(bad("Invalid app capability name"))?;
        return apps::invoke_app(a, h, id, action, v).await;
    }
    if name.starts_with("knowledge.") {
        merchant(a, h)?;
    }
    if name == "merchant.apply" {
        auth::permit(h, "catalog")?;
    }
    match name {
        "catalog.search" => {
            let Json(mut result) = catalog(State(a.clone()), h.clone()).await?;
            let query = v["query"].as_str().unwrap_or("").to_lowercase();
            result["elements"] = json!(
                result["elements"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|p| format!(
                        "{} {}",
                        p["name"].as_str().unwrap_or(""),
                        p["description"].as_str().unwrap_or("")
                    )
                    .to_lowercase()
                    .contains(&query))
                    .collect::<Vec<_>>()
            );
            Ok(result)
        }
        "catalog.detail" => {
            let Json(v) = commerce::product_detail(
                State(a.clone()),
                h.clone(),
                Path(
                    v["productId"]
                        .as_str()
                        .ok_or(bad("Product ID required"))?
                        .into(),
                ),
            )
            .await?;
            Ok(v)
        }
        "checkout.options" => {
            let Json(v) = commerce::options(State(a.clone()), h.clone()).await?;
            Ok(v)
        }
        "checkout.select" => {
            let Json(v) =
                commerce::select_checkout(State(a.clone()), h.clone(), Json(v.clone())).await?;
            Ok(v)
        }
        "knowledge.graph" => Ok(knowledge::graph(&a.db, &tenant(h)?).await?),
        "knowledge.search" => retrieve(a, &tenant(h)?, v["query"].as_str().unwrap_or("")).await,
        "cart.create" => {
            let c = new_cart(
                a,
                &tenant(h)?,
                v["session"].as_str().unwrap_or(""),
                &language_context(a, h).await?.0,
                "mcp",
            )
            .await?;
            cart_json(a, &c).await
        }
        "cart.quote" => cart_json(a, &load_cart(a, h).await?).await,
        "cart.replace" => {
            let i = serde_json::from_value(v["items"].clone()).map_err(|e| bad(e.to_string()))?;
            let c = set_items(
                a,
                h,
                i,
                Some(v["revision"].as_i64().ok_or(bad("revision required"))?),
            )
            .await?;
            cart_json(a, &c).await
        }
        "checkout.complete" => {
            checkout(
                a,
                h,
                v["idempotency_key"]
                    .as_str()
                    .ok_or(bad("idempotency_key required"))?,
            )
            .await
        }
        "merchant.plan" => {
            let t = merchant(a, h)?;
            let (locale, _) = language_context(a, h).await?;
            plan_with(
                a,
                &t,
                v["instruction"].as_str().unwrap_or(""),
                None,
                "",
                &locale,
            )
            .await
        }
        "merchant.apply" => {
            let t = merchant(a, h)?;
            if v["approve"] != true {
                return Err(bad("approve=true required"));
            }
            apply(a, &t, v["task_id"].as_str().ok_or(bad("task_id required"))?).await
        }
        "merchant.orders" => {
            let Json(v) = orders(State(a.clone()), h.clone()).await?;
            Ok(v)
        }
        _ => Err(bad("Unknown capability")),
    }
}
