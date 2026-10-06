//! Typed MCP schemas and JSON-RPC transport.
use crate::*;

pub(crate) fn tool_schema(name: &str) -> Value {
    if let Some(schema) = history::schema(name) {
        return schema;
    }
    if let Some(schema) = documents::knowledge_schema(name) {
        return schema;
    }
    let props = match name {
        "merchant.company" => json!({"channelId":{"type":"string"}}),
        "merchant.company.save" => {
            json!({"channelId":{"type":"string"},"revision":{"type":"integer","minimum":0},"baseRevision":{"type":"integer","minimum":0},"data":{"type":"object"}})
        }
        "merchant.commerce.read" => json!({"channelId":{"type":"string"}}),
        "merchant.commerce.save" => {
            json!({"channelId":{"type":"string"},"baseRevision":{"type":"integer","minimum":0},"revision":{"type":"integer","minimum":0},"data":{"type":"object"}})
        }
        "merchant.commerce.dependencies" => {
            json!({"area":{"type":"string","enum":["shipping","payments"]},"methodId":{"type":"string"}})
        }
        "merchant.media.list" => json!({"productId":{"type":"string"}}),
        "merchant.media.create" => {
            json!({"productId":{"type":"string"},"revision":{"type":"integer","minimum":1},"mode":{"type":"string","enum":["generate","optimize"]},"sourceId":{"type":["string","null"]},"prompt":{"type":"string","minLength":1,"maxLength":2000}})
        }
        "merchant.media.detail" => json!({"id":{"type":"string"}}),
        "merchant.media.apply" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer","minimum":1}})
        }
        "merchant.translations.create" => {
            json!({"targetLocale":{"type":"string"},"overwrite":{"type":"boolean"},"inference":{"type":"object","properties":{"provider":{"type":"string","enum":["ollama","openai","anthropic"]},"model":{"type":["string","null"]}},"additionalProperties":false}})
        }
        "merchant.translations.detail" => {
            json!({"id":{"type":"string"},"cursor":{"type":"string"}})
        }
        "merchant.translations.control" => {
            json!({"id":{"type":"string"},"action":{"type":"string","enum":["resume","cancel"]}})
        }
        "merchant.translations.apply" => {
            json!({"id":{"type":"string"},"productId":{"type":"string"}})
        }
        "merchant.products" => {
            json!({"search":{"type":"string","maxLength":200},"after":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":100},"active":{"type":"boolean"},"categoryId":{"type":"string"},"parentId":{"type":"string"},"lowStock":{"type":"boolean"}})
        }
        "merchant.categories" => json!({}),
        "merchant.product.create" => json!({"product":{"type":"object"}}),
        "merchant.category.create" => json!({"category":{"type":"object"}}),
        "merchant.category.save" => json!({"id":{"type":"string"},"category":{"type":"object"}}),
        "automation.save" => {
            json!({"kind":{"type":"string","enum":["rules","flows","promotions","channels"]},"id":{"type":"string"},"revision":{"type":"integer","minimum":0},"data":{"type":"object"}})
        }
        "automation.delete" => {
            json!({"kind":{"type":"string","enum":["rules","flows","promotions","channels"]},"id":{"type":"string"},"revision":{"type":"integer","minimum":1}})
        }
        "automation.dependencies" => {
            json!({"kind":{"type":"string","enum":["rules","flows","promotions","channels"]},"id":{"type":"string"}})
        }
        "automation.preview" | "automation.import" => json!({"condition":{"type":"object"}}),
        "merchant.customer.addresses" => json!({"id":{"type":"string"}}),
        "merchant.customer.address.save" => {
            json!({"id":{"type":"string"},"addressId":{"type":"string"},"revision":{"type":"integer"},"address":{"type":"object"},"defaultBilling":{"type":"boolean"},"defaultShipping":{"type":"boolean"}})
        }
        "merchant.customer.address.delete" => {
            json!({"id":{"type":"string"},"addressId":{"type":"string"},"revision":{"type":"integer"}})
        }
        "merchant.workflow.save" => json!({"revision":{"type":"integer"},"data":{"type":"object"}}),
        "merchant.product.content" | "merchant.product.assets" => json!({"id":{"type":"string"}}),
        "merchant.product.save" => json!({"id":{"type":"string"},"product":{"type":"object"}}),
        "merchant.asset.publish" => {
            json!({"id":{"type":"string"},"digest":{"type":"string"},"public":{"type":"boolean"}})
        }
        "merchant.customers" | "merchant.orders" => {
            json!({"query":{"type":"string"},"after":{"type":"string"},"state":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":100}})
        }
        "merchant.customer" | "merchant.order" | "merchant.receipts" => {
            json!({"id":{"type":"string"}})
        }
        "merchant.customer.save" => json!({"id":{"type":"string"},"customer":{"type":"object"}}),
        "merchant.order.transition" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer"},"kind":{"type":"string","enum":["order","payment","delivery"]},"state":{"type":"string"},"trackingCode":{"type":"string"},"trackingUrl":{"type":"string","format":"uri"},"requestKey":{"type":"string"},"action":{"type":"string"},"deliveryIndex":{"type":"integer","minimum":0}})
        }
        "merchant.order.note" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer"},"text":{"type":"string","maxLength":4000}})
        }
        "merchant.receipt.create" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer"},"kind":{"type":"string","enum":["invoice","delivery_note","cancellation"]},"locale":{"type":"string","enum":["en","de","fr","es"]},"requestKey":{"type":"string"},"referenceId":{"type":"string"}})
        }
        "merchant.payment.onboarding" => {
            json!({"id":{"type":"string"},"operation":{"type":"string","enum":["start","status","disconnect"]},"channel":{"type":"string"},"environment":{"type":"string","enum":["sandbox","live","contract-fixture"]},"country":{"type":"string"},"requestKey":{"type":"string"},"approve":{"type":"boolean"}})
        }
        "merchant.payment" => {
            json!({"id":{"type":"string"},"operation":{"type":"string","enum":["capture","authorize","void","refund","reconcile","cancel"]},"amountMinor":{"type":"integer","minimum":1},"requestKey":{"type":"string"},"approve":{"type":"boolean"}})
        }
        "developer.archive" => {
            json!({"app":{"type":"string"},"archived":{"type":"boolean"},"approve":{"type":"boolean"}})
        }
        "developer.import" => {
            json!({"environment":{"type":"string"},"prompt":{"type":"string"},"summary":{"type":"object"},"manifest":{"type":"object"}})
        }
        "developer.stage" => {
            json!({"buildId":{"type":"string"},"digest":{"type":"string"},"approve":{"type":"boolean"}})
        }
        "developer.task" => {
            json!({"environment":{"type":"string"},"prompt":{"type":"string"},"agent":{"type":"string"}})
        }
        "catalog.search" => {
            json!({"query":{"type":"string","maxLength":200},"category":{"type":"string","maxLength":100},"after":{"type":"string","maxLength":200},"limit":{"type":"integer","minimum":1,"maximum":100}})
        }
        "knowledge.search" | "knowledge.external" => json!({"query":{"type":"string"}}),
        "cart.create" => json!({"session":{"type":"string"}}),
        "catalog.detail" => {
            json!({"productId":{"type":"string"},"after":{"type":"string","maxLength":200},"limit":{"type":"integer","minimum":1,"maximum":100}})
        }
        "checkout.select" => {
            json!({"revision":{"type":"integer"},"checkout":{"type":"object","properties":{"country":{"type":"string"},"shippingMethodId":{"type":"string"},"paymentMethodId":{"type":"string"},"customerEmail":{"type":["string","null"]},"address":{"type":["object","null"]},"billingAddress":{"type":["object","null"]},"billingAddressId":{"type":["string","null"]},"shippingAddressId":{"type":["string","null"]}},"additionalProperties":false}})
        }
        "cart.replace" => {
            json!({"revision":{"type":"integer"},"items":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"quantity":{"type":"integer","minimum":1}},"required":["id","quantity"]}}})
        }
        "checkout.complete" => json!({"idempotency_key":{"type":"string"}}),
        "merchant.plan" => json!({"instruction":{"type":"string"}}),
        "merchant.apply" => json!({"task_id":{"type":"string"},"approve":{"type":"boolean"}}),
        _ => json!({}),
    };
    let required = match name {
        "merchant.company.save" => vec!["revision", "data"],
        "merchant.commerce.save" => vec!["revision", "data"],
        "merchant.commerce.dependencies" => vec!["area", "methodId"],
        "merchant.media.list" => vec!["productId"],
        "merchant.media.create" => vec!["productId", "revision", "mode", "prompt"],
        "merchant.media.detail" => vec!["id"],
        "merchant.media.apply" => vec!["id", "revision"],
        "merchant.translations.create" => vec!["targetLocale"],
        "merchant.translations.control" => vec!["id", "action"],
        "merchant.translations.apply" | "merchant.translations.detail" => vec!["id"],
        "merchant.product.create" => vec!["product"],
        "merchant.category.create" => vec!["category"],
        "merchant.category.save" => vec!["id", "category"],
        "automation.delete" => vec!["kind", "id", "revision"],
        "automation.dependencies" => vec!["kind", "id"],
        "automation.save" => vec!["kind", "id", "revision", "data"],
        "automation.preview" | "automation.import" => vec!["condition"],
        "merchant.customer.addresses" => vec!["id"],
        "merchant.customer.address.save" => vec!["id", "address"],
        "merchant.customer.address.delete" => vec!["id", "addressId", "revision"],
        "merchant.workflow.save" => vec!["revision", "data"],
        "merchant.product.content" | "merchant.product.assets" => vec!["id"],
        "merchant.product.save" => vec!["id", "product"],
        "merchant.asset.publish" => vec!["id", "digest", "public"],
        "merchant.customer" | "merchant.order" | "merchant.receipts" => vec!["id"],
        "merchant.customer.save" => vec!["id", "customer"],
        "merchant.order.transition" => vec!["id", "revision", "kind", "state"],
        "merchant.order.note" => vec!["id", "revision", "text"],
        "merchant.receipt.create" => vec!["id", "revision", "kind", "locale", "requestKey"],
        "merchant.payment" => vec!["id", "operation", "requestKey", "approve"],
        "developer.archive" => vec!["app", "archived", "approve"],
        "developer.import" => vec!["environment", "prompt", "summary", "manifest"],
        "developer.stage" => vec!["buildId", "digest", "approve"],
        "developer.task" => vec!["environment", "prompt", "agent"],
        "cart.replace" => vec!["revision", "items"],
        "catalog.detail" => vec!["productId"],
        "checkout.select" => vec!["revision", "checkout"],
        "checkout.complete" => vec!["idempotency_key"],
        "merchant.plan" => vec!["instruction"],
        "merchant.apply" => vec!["task_id", "approve"],
        _ => vec![],
    };
    json!({"type":"object","properties":props,"required":required,"additionalProperties":false})
}
pub(crate) async fn mcp(State(a): State<App>, h: HeaderMap, Json(v): Json<Value>) -> Response {
    if let Some(origin) = header(&h, "origin") {
        // Trust only explicit deployment configuration, never Host or forwarded headers.
        let public = env::var("COMMERCE_PUBLIC_ORIGIN").ok().and_then(|v| {
            reqwest::Url::parse(&v)
                .ok()
                .filter(|u| {
                    u.scheme() == "https"
                        && u.username().is_empty()
                        && u.password().is_none()
                        && u.path() == "/"
                        && u.query().is_none()
                        && u.fragment().is_none()
                })
                .map(|u| u.origin().ascii_serialization())
        });
        let bind = env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
        let local = bind
            .parse::<std::net::SocketAddr>()
            .ok()
            .filter(|b| b.ip().is_loopback());
        let loopback = local.is_some_and(|b| {
            origin == format!("http://{}", b) || origin == format!("http://localhost:{}", b.port())
        });
        if public.as_deref() != Some(origin) && !loopback {
            return Error(StatusCode::FORBIDDEN, "Origin rejected".into()).into_response();
        }
    }
    if v["jsonrpc"] != "2.0" {
        return bad("JSON-RPC 2.0 required").into_response();
    }
    let id = v["id"].clone();
    let method = v["method"].as_str().unwrap_or("");
    if id.is_null() {
        return StatusCode::ACCEPTED.into_response();
    }
    let result = match method {
        "initialize" => Ok(
            json!({"protocolVersion":if v["params"]["protocolVersion"]=="2025-11-25"{"2025-11-25"}else{"2026-07-28"},"capabilities":{"tools":{},"resources":{}},"serverInfo":{"name":"vendune","version":env!("CARGO_PKG_VERSION")}}),
        ),
        "ping" => Ok(json!({})),
        "tools/list" => {
            let mut tools = CAPABILITIES
                .iter()
                .filter(|(n, _)| {
                    if history::schema(n).is_some() {
                        return merchant(&a, &h).is_ok() && history::visible(&h, n);
                    }
                    if let Some(permission) = assets::media_permission(n) {
                        return merchant(&a, &h).is_ok() && auth::permit(&h, permission).is_ok();
                    }
                    if let Some(permission) = commerce::international_permission(n) {
                        return merchant(&a, &h).is_ok() && auth::permit(&h, permission).is_ok();
                    }
                    if n.starts_with("automation.") {
                        return merchant(&a, &h).is_ok()
                            && auth::permit(&h, "settings.read").is_ok()
                            && (!matches!(
                                *n,
                                "automation.save" | "automation.import" | "automation.delete"
                            ) || auth::permit(&h, "settings.write").is_ok());
                    }
                    if n.starts_with("knowledge.") {
                        return merchant(&a, &h).is_ok()
                            && auth::permit(&h, "knowledge.read").is_ok()
                            && (!matches!(
                                *n,
                                "knowledge.source.create"
                                    | "knowledge.source.edit"
                                    | "knowledge.source.visibility"
                                    | "knowledge.source.archive"
                            ) || auth::permit(&h, "catalog").is_ok());
                    }
                    if let Some(permission) = operations::permission(n) {
                        return merchant(&a, &h).is_ok() && auth::permit(&h, permission).is_ok();
                    }
                    if n.starts_with("developer.") {
                        return merchant(&a, &h).is_ok() && auth::permit(&h, "users").is_ok();
                    }
                    !(n.starts_with("merchant.") || n.starts_with("knowledge."))
                        || merchant(&a, &h).is_ok()
                            && (*n != "merchant.apply" || auth::permit(&h, "catalog").is_ok())
                })
                .map(|(n, d)| json!({"name":n,"description":d,"inputSchema":tool_schema(n)}))
                .collect::<Vec<_>>();
            match apps::app_tools(&a, &h).await {
                Ok(apps) => {
                    tools.extend(apps);
                    Ok(json!({"tools":tools}))
                }
                Err(e) => Err(e),
            }
        }
        "tools/call" => match invoke_transport(
            &a,
            &h,
            v["params"]["name"].as_str().unwrap_or(""),
            &v["params"]["arguments"],
        )
        .await
        {
            Ok(x) => Ok(
                json!({"content":[{"type":"text","text":x.to_string()}],"structuredContent":x,"isError":false}),
            ),
            Err(e) => Ok(json!({"content":[{"type":"text","text":e.1}],"isError":true})),
        },
        "resources/list" => Ok(
            json!({"resources":[{"uri":"commerce://capabilities","name":"Commerce capabilities","mimeType":"application/json"}]}),
        ),
        "resources/read" if v["params"]["uri"] == "commerce://capabilities" => Ok(
            json!({"contents":[{"uri":"commerce://capabilities","mimeType":"application/json","text":json!({"capabilities":CAPABILITIES}).to_string()}]}),
        ),
        _ => Err(bad("Method not supported")),
    };
    Json(match result {
        Ok(r) => json!({"jsonrpc":"2.0","id":id,"result":r}),
        Err(e) => json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":e.1}}),
    })
    .into_response()
}

/// MCP opt-out is independent of a merchant's selected internal planning tools.
async fn invoke_transport(a: &App, h: &HeaderMap, name: &str, input: &Value) -> Result<Value> {
    if let Some(app) = name.strip_prefix("app.") {
        let (id, action) = app
            .split_once('.')
            .ok_or(bad("Invalid app capability name"))?;
        return apps::invoke_mcp(a, h, id, action, input).await;
    }
    if [
        "catalog.search",
        "catalog.detail",
        "checkout.options",
        "cart.quote",
    ]
    .contains(&name)
    {
        performance::read_scope(invoke(a, h, name, input)).await
    } else {
        invoke(a, h, name, input).await
    }
}
