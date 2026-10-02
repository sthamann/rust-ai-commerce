//! Typed MCP schemas and JSON-RPC transport.
use crate::*;

pub(crate) fn tool_schema(name: &str) -> Value {
    let props = match name {
        "developer.import" => {
            json!({"environment":{"type":"string"},"prompt":{"type":"string"},"summary":{"type":"object"},"manifest":{"type":"object"}})
        }
        "developer.stage" => {
            json!({"buildId":{"type":"string"},"digest":{"type":"string"},"approve":{"type":"boolean"}})
        }
        "developer.task" => {
            json!({"environment":{"type":"string"},"prompt":{"type":"string"},"agent":{"type":"string"}})
        }
        "catalog.search" | "knowledge.search" => json!({"query":{"type":"string"}}),
        "cart.create" => json!({"session":{"type":"string"}}),
        "catalog.detail" => json!({"productId":{"type":"string"}}),
        "checkout.select" => {
            json!({"revision":{"type":"integer"},"checkout":{"type":"object","properties":{"country":{"type":"string"},"shippingMethodId":{"type":"string"},"paymentMethodId":{"type":"string"},"address":{"type":["object","null"],"properties":{"name":{"type":"string"},"street":{"type":"string"},"postalCode":{"type":"string"},"city":{"type":"string"}},"required":["name","street","postalCode","city"],"additionalProperties":false}},"required":["country","shippingMethodId","paymentMethodId"],"additionalProperties":false}})
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
    if let Some(origin) = header(&h, "origin")
        && !["http://127.0.0.1:8787", "http://localhost:8787"].contains(&origin)
    {
        return Error(StatusCode::FORBIDDEN, "Origin rejected".into()).into_response();
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
            json!({"protocolVersion":if v["params"]["protocolVersion"]=="2025-11-25"{"2025-11-25"}else{"2026-07-28"},"capabilities":{"tools":{},"resources":{}},"serverInfo":{"name":"rust-ai-commerce","version":env!("CARGO_PKG_VERSION")}}),
        ),
        "ping" => Ok(json!({})),
        "tools/list" => {
            let mut tools = CAPABILITIES
                .iter()
                .filter(|(n, _)| {
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
        "tools/call" => match invoke(
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
