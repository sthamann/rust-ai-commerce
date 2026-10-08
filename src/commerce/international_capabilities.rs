//! International configuration and translation MCP tools call the exact same scoped native handlers as HTTP.
use super::*;
pub(crate) fn international_permission(name: &str) -> Option<&'static str> {
    match name {
        "merchant.commerce.read" | "merchant.commerce.dependencies" => Some("settings.read"),
        "merchant.commerce.save" => Some("settings.write"),
        "merchant.translations.list" | "merchant.translations.detail" => Some("catalog.read"),
        "merchant.translations.create"
        | "merchant.translations.control"
        | "merchant.translations.apply" => Some("catalog.write"),
        _ => None,
    }
}
pub(crate) async fn international_invoke(
    a: &App,
    h: &RequestContext,
    name: &str,
    v: &Value,
) -> Result<Value> {
    auth::permit(
        h,
        international_permission(name).ok_or(bad("Unknown international capability"))?,
    )?;
    let state = State(a.clone());
    let headers = h.clone();
    let id = || {
        v["id"]
            .as_str()
            .map(String::from)
            .ok_or(bad("Translation ID required"))
    };
    let Json(result) = match name {
        "merchant.commerce.read" => {
            if let Some(channel) = v["channelId"].as_str() {
                get_scope(state, headers, Path(channel.into())).await?
            } else {
                merchant_config(state, headers).await?
            }
        }
        "merchant.commerce.dependencies" => {
            method_dependencies(
                state,
                headers,
                Path((
                    v["area"]
                        .as_str()
                        .ok_or(bad("Method area required"))?
                        .into(),
                    v["methodId"]
                        .as_str()
                        .ok_or(bad("Method ID required"))?
                        .into(),
                )),
            )
            .await?
        }
        "merchant.commerce.save" => {
            if let Some(channel) = v["channelId"].as_str() {
                save_scope(state, headers, Path(channel.into()), Json(v.clone())).await?
            } else {
                save_config(state, headers, Json(v.clone())).await?
            }
        }
        "merchant.translations.list" => translations::list(state, headers).await?,
        "merchant.translations.create" => {
            translations::create(state, headers, Json(v.clone())).await?
        }
        "merchant.translations.detail" => {
            translations::detail(
                state,
                headers,
                Path(id()?),
                axum::extract::Query(HashMap::from([(
                    "cursor".into(),
                    v["cursor"].as_str().unwrap_or("").into(),
                )])),
            )
            .await?
        }
        "merchant.translations.control" => {
            translations::control(
                state,
                headers,
                Path(id()?),
                Json(json!({"action":v["action"]})),
            )
            .await?
        }
        "merchant.translations.apply" => {
            translations::apply(
                state,
                headers,
                Path(id()?),
                Json(json!({"productId":v["productId"]})),
            )
            .await?
        }
        _ => return Err(bad("Unknown international capability")),
    };
    Ok(result)
}
