//! Provider-specific read imports and notification mapping stay outside the commerce kernel.
use super::*;
mod analytics;
mod gmail;
pub use analytics::analytics;
pub use gmail::gmail;
pub async fn slack(store: &Store, t: &str, payload: &Value, settings: &Value) -> Result<Value> {
    let channel = payload["channel"]
        .as_str()
        .filter(|s| !s.is_empty())
        .or(settings["channelId"].as_str())
        .unwrap_or("");
    checked(
        regex::Regex::new(r"^[CG][A-Z0-9]{6,30}$")
            .unwrap()
            .is_match(channel),
        "Slack channel ID required",
    )?;
    let event = &payload["event"];
    let order = &event["order"];
    let number = order
        .get("orderNumber")
        .or(event.get("orderNumber"))
        .unwrap_or(&event["orderId"]);
    let total = order
        .pointer("/cart/price/totalPrice")
        .unwrap_or(&event["totalPrice"]);
    let template = payload["template"]
        .as_str()
        .filter(|s| !s.is_empty())
        .or(settings["template"].as_str())
        .unwrap_or("Order {orderNumber} · {totalPrice} EUR");
    let string = |v: &Value| v.as_str().map(str::to_owned).unwrap_or(v.to_string());
    let value = template
        .replace("{orderNumber}", &string(number))
        .replace("{totalPrice}", &string(total))
        .replace(
            "{event}",
            payload["kind"].as_str().unwrap_or("order.placed"),
        );
    let value = templates::escape(&value)
        .chars()
        .take(3000)
        .collect::<String>();
    let before = store.get(t, "slack").await?;
    let token = oauth::token(store, t, "slack").await?;
    let mut fence = store.tx(t).await?;
    store.lock(&mut fence, t, "slack").await?;
    let current = store.get_tx(&mut fence, t, "slack").await?;
    checked(
        current["revision"] == before["revision"]
            && current["settings"] == *settings
            && current["tokens"]["access_token"] == token,
        "Connection changed before Slack dispatch",
    )?;
    let response=network::request(&format!("{}/chat.postMessage",network::endpoint("slack")?),Some(&json!({"channel":channel,"text":value,"unfurl_links":false,"unfurl_media":false,"metadata":{"event_type":"commerce_notification","event_payload":{"delivery_key":payload["deliveryKey"]}}})),Some(&token),false).await?;
    checked(response["ok"] == true, "Slack rejected notification")?;
    Ok(json!({"channel":response["channel"],"timestamp":response["ts"],"state":"sent"}))
}
