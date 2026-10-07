//! Email app actions/events retain the published gateway, flow and MCP payload contract.
use super::*;
use config::{Provider, Settings};
pub async fn action(store: &Store, t: &str, name: &str, v: &Value) -> Result<Value> {
    if name == "status" {
        let mut value = config::public(store, t).await?;
        value["defaultTemplates"] = templates::defaults();
        return Ok(value);
    }
    if name == "configure" {
        return config::configure(store, t, v).await;
    }
    let current = store.get(t, "email").await?;
    let s = config::parse(&current["settings"])?;
    if name == "preview_order" {
        return Ok(json!({"mail":templates::order(v,&s)?,"externalDelivery":false}));
    }
    checked(
        ["send", "send_order"].contains(&name),
        "Unknown email action",
    )?;
    checked(s.enabled, "Email delivery disabled")?;
    let mail = if name == "send_order" {
        templates::order(v, &s)?
    } else {
        templates::envelope(&v["message"], &s)?
    };
    checked(
        v.get("dryRun").is_none_or(Value::is_boolean),
        "Test switch must be boolean",
    )?;
    let dry = s.dry_run || v["dryRun"] == true;
    if !dry {
        checked(
            config::configured(
                &s,
                &config::credentials(current.get("credentials").unwrap_or(&json!({})))?,
            ),
            "Mail provider configuration required",
        )?;
    }
    store
        .enqueue(
            t,
            "email",
            &text(v, "requestKey"),
            &json!({"mail":mail,"revision":current["revision"],"dryRun":dry}),
        )
        .await
}
pub async fn event(store: &Store, t: &str, v: &Value) -> Result<Value> {
    let s = config::parse(&store.get(t, "email").await?["settings"])?;
    let kind = text(v, "kind");
    if [
        "withdrawal",
        "access",
        "erase",
        "correct",
        "portability",
        "objection",
    ]
    .iter()
    .any(|k| kind == format!("consumer.{k}.requested"))
    {
        if !s.notify_consumer_requests || !s.enabled {
            return Ok(json!({"ignored":true,"reason":"Consumer receipt email disabled"}));
        }
        return action(store,t,"send",&json!({"message":templates::consumer(&v["data"],&s)?,"requestKey":v["idempotencyKey"]})).await;
    }
    if kind == "order.placed" && s.notify_orders {
        return action(
            store,
            t,
            "send_order",
            &json!({"event":v["data"],"requestKey":v["idempotencyKey"]}),
        )
        .await;
    }
    Ok(json!({"ignored":true}))
}
pub async fn deliver(
    s: &Settings,
    credentials: &config::Credentials,
    j: &queue::Job,
) -> Result<Value> {
    let m: templates::Mail = serde_json::from_value(j.payload["mail"].clone())
        .map_err(|_| Error::Invalid("Invalid queued mail"))?;
    if j.payload["dryRun"] == true {
        return Ok(
            json!({"outcome":"dry_run","provider":s.provider,"recipientCount":m.to.len(),"externalDelivery":false}),
        );
    }
    let key = digest(format!("{}:{}", j.tenant, j.id).as_bytes());
    if s.provider == Provider::Smtp {
        return smtp::deliver(s, credentials, &m, &key).await;
    }
    api(s, credentials, &m, &key).await
}
async fn api(
    s: &Settings,
    c: &config::Credentials,
    m: &templates::Mail,
    key: &str,
) -> Result<Value> {
    let (url, mut body) = if s.provider == Provider::Resend {
        (
            format!("{}/emails", network::endpoint("resend")?),
            json!({"from":format!("{} <{}>",m.from_name,m.from_email),"to":m.to,"subject":m.subject}),
        )
    } else {
        let mut p = json!({"to":m.to.iter().map(|s|json!({"email":s})).collect::<Vec<_>>()});
        for (k, v) in [("cc", &m.cc), ("bcc", &m.bcc)] {
            if !v.is_empty() {
                p[k] = json!(v.iter().map(|s| json!({"email":s})).collect::<Vec<_>>());
            }
        }
        let content = [("text/plain", &m.text), ("text/html", &m.html)]
            .into_iter()
            .filter(|(_, v)| !v.is_empty())
            .map(|(kind, v)| json!({"type":kind,"value":v}))
            .collect::<Vec<_>>();
        (
            format!(
                "{}/mail/send",
                network::endpoint(if s.region == "eu" {
                    "sendgrid_eu"
                } else {
                    "sendgrid"
                })?
            ),
            json!({"personalizations":[p],"from":{"email":m.from_email,"name":m.from_name},"subject":m.subject,"content":content}),
        )
    };
    if s.provider == Provider::Resend {
        for (k, v) in [
            ("text", json!(m.text)),
            ("html", json!(m.html)),
            ("cc", json!(m.cc)),
            ("bcc", json!(m.bcc)),
        ] {
            if v.as_str().is_some_and(|s| !s.is_empty())
                || v.as_array().is_some_and(|a| !a.is_empty())
            {
                body[k] = v;
            }
        }
    }
    if !m.reply_to.is_empty() {
        body["reply_to"] = if s.provider == Provider::Resend {
            json!(m.reply_to)
        } else {
            json!({"email":m.reply_to})
        };
    }
    let mut request = network::client()?
        .post(url)
        .bearer_auth(&c.api_key)
        .json(&body);
    if s.provider == Provider::Resend {
        request = request.header("Idempotency-Key", key);
    }
    let response = request.send().await?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let retry = response
            .headers()
            .get("retry-after")
            .and_then(|x| x.to_str().ok())
            .and_then(|x| x.parse::<u64>().ok())
            .unwrap_or(30)
            .clamp(1, 3600);
        return Err(Error::Http(status, retry));
    }
    let header = response
        .headers()
        .get("x-message-id")
        .and_then(|x| x.to_str().ok())
        .unwrap_or("")
        .to_owned();
    // A malformed receipt after explicit success is still accepted; never repeat the send.
    let receipt = network::bytes(response, 65536)
        .await
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or(json!({}));
    let id = receipt["id"]
        .as_str()
        .unwrap_or(&header)
        .chars()
        .take(200)
        .collect::<String>();
    Ok(json!({"outcome":"accepted","provider":s.provider,"messageId":id}))
}
