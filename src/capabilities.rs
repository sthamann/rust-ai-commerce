//! Shared HTTP/MCP capability dispatch and tool authorization.
use crate::*;

pub(crate) const CAPABILITIES: &[(&str, &str)] = &[
    (
        "merchant.commerce.read",
        "Read countries, tax rules, shipping, payment and content languages",
    ),
    (
        "merchant.commerce.save",
        "Revision-bound international commerce settings update",
    ),
    (
        "merchant.translations.list",
        "Read catalogue translation jobs",
    ),
    (
        "merchant.translations.create",
        "Start an AI catalogue translation draft job",
    ),
    (
        "merchant.translations.detail",
        "Read paginated source and translated product drafts",
    ),
    (
        "merchant.translations.control",
        "Resume or cancel a translation job",
    ),
    (
        "merchant.translations.apply",
        "Apply at most 50 revision-checked translation drafts",
    ),
    (
        "merchant.products",
        "Search/filter own products before cursor pagination",
    ),
    (
        "merchant.product.create",
        "Create a native product or variant with localized content and category/channel associations",
    ),
    (
        "merchant.categories",
        "Read own category tree and translations",
    ),
    (
        "merchant.category.create",
        "Create a localized inactive or active category",
    ),
    (
        "merchant.category.save",
        "Revision-bound category content and cycle-safe parent edit",
    ),
    (
        "automation.catalog",
        "Read original rule scopes and executable native action contracts",
    ),
    (
        "automation.list",
        "Read own rule, promotion and flow definitions and jobs",
    ),
    (
        "automation.save",
        "Revision-bound rule, promotion, channel or flow graph write",
    ),
    (
        "automation.preview",
        "Evaluate a rule against an authoritative cart without effects",
    ),
    (
        "automation.import",
        "Validate and normalize an original Shopware condition without saving",
    ),
    (
        "merchant.workflow",
        "Read multilingual state machine and transitions",
    ),
    (
        "merchant.workflow.save",
        "Revision-bound declarative workflow extension",
    ),
    (
        "merchant.product.content",
        "Read enabled-language product content",
    ),
    (
        "merchant.product.save",
        "Revision-bound product content update",
    ),
    (
        "merchant.product.assets",
        "Read asset metadata without binary secrets",
    ),
    ("merchant.asset.publish", "Digest-bound file publication"),
    (
        "merchant.customer.addresses",
        "List owning customer address book",
    ),
    (
        "merchant.customer.address.save",
        "Create/update customer address and defaults with revision",
    ),
    (
        "merchant.customer.address.delete",
        "Delete customer address with revision",
    ),
    ("merchant.customers", "Search tenant customers"),
    ("merchant.customer", "Read customer details"),
    ("merchant.customer.save", "Revision-checked customer update"),
    ("merchant.order", "Read order detail and activity"),
    (
        "merchant.order.transition",
        "Revision-checked order payment or delivery transition",
    ),
    ("merchant.order.note", "Append an operational note"),
    ("merchant.receipts", "Read immutable order receipts"),
    (
        "merchant.receipt.create",
        "Generate a numbered immutable receipt and PDF",
    ),
    (
        "merchant.payment",
        "Explicitly approved idempotent provider command",
    ),
    (
        "developer.archive",
        "Explicit recoverable App Studio project removal or restore",
    ),
    (
        "developer.builds",
        "Read own immutable app development versions",
    ),
    (
        "developer.import",
        "Import a reviewed declarative package as a draft in a private environment",
    ),
    (
        "developer.stage",
        "Explicitly install a digest-bound app build in a private sandbox",
    ),
    (
        "developer.task",
        "Export an environment-scoped coding-agent task",
    ),
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
    (
        "knowledge.external",
        "Read merchant-private Gmail/Analytics sources with provenance",
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
    if commerce::international_permission(name).is_some() {
        return commerce::international_invoke(a, h, name, v).await;
    }
    if name.starts_with("automation.") {
        return marketing::invoke(a, h, name, v).await;
    }
    if operations::permission(name).is_some() {
        return operations::invoke(a, h, name, v).await;
    }
    if name.starts_with("developer.") {
        return developer::invoke(a, h, name, v).await;
    }
    if let Some(app) = name.strip_prefix("app.") {
        let (id, action) = app
            .split_once('.')
            .ok_or(bad("Invalid app capability name"))?;
        return apps::invoke_app(a, h, id, action, v).await;
    }
    if name.starts_with("knowledge.") {
        merchant(a, h)?;
        auth::permit(h, "knowledge.read")?;
    }
    if name == "merchant.apply" {
        auth::permit(h, "catalog")?;
    }
    match name {
        "catalog.search" => {
            let criteria =
                serde_json::from_value(v.clone()).map_err(|_| bad("Invalid catalog criteria"))?;
            let Json(result) = catalog_page(State(a.clone()), h.clone(), criteria).await?;
            Ok(result)
        }
        "catalog.detail" => {
            let criteria =
                serde_json::from_value(v.clone()).map_err(|_| bad("Invalid variant criteria"))?;
            let Json(v) = commerce::product_detail(
                State(a.clone()),
                h.clone(),
                Path(
                    v["productId"]
                        .as_str()
                        .ok_or(bad("Product ID required"))?
                        .into(),
                ),
                axum::extract::Query(criteria),
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
        "knowledge.external" => Ok(
            json!({"elements":apps::private_evidence(a,&tenant(h)?,v["query"].as_str().unwrap_or("")).await?}),
        ),
        "knowledge.graph" => Ok(knowledge::graph(&a.db, &tenant(h)?).await?),
        "knowledge.search" => retrieve(a, &tenant(h)?, v["query"].as_str().unwrap_or("")).await,
        "cart.create" => {
            let c = new_cart_context(a, h, v["session"].as_str().unwrap_or(""), "mcp").await?;
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
            auth::permit(h, "knowledge.read")?;
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
