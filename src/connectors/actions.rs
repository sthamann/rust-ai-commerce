//! Existing standard-app actions and event/export endpoints share validated tenant-bound dispatch.
use super::*;
pub async fn public(store: &Store, t: &str, a: &str) -> Result<Value> {
    let v = store.get(t, a).await?;
    let prefix = if a == "slack" { "SLACK" } else { "GOOGLE" };
    Ok(
        json!({"connected":v["tokens"].is_object(),"revision":v["revision"],"settings":v["settings"],"jobs":store.jobs(t,a).await?,"oauthClientConfigured":env::var(format!("{prefix}_CLIENT_ID")).is_ok_and(|s|!s.is_empty()) && env::var(format!("{prefix}_CLIENT_SECRET")).is_ok_and(|s|!s.is_empty())}),
    )
}
pub async fn action(store: &Store, t: &str, a: &str, name: &str, v: &Value) -> Result<Value> {
    if a == "email" {
        return email::action(store, t, name, v).await;
    }
    match name {
        "status"=>public(store,t,a).await,
        "connect"=>oauth::start(store,t,a).await,
        "disconnect"=>oauth::disconnect(store,t,a).await,
        "configure"=>configure(store,t,a,v).await,
        "tracking" if a=="google_analytics"=>{let vconfig=store.get(t,a).await?;let s=&vconfig["settings"];let measurement=&s["measurementId"];let channel=text(s,"salesChannel");let enabled=measurement.as_str().is_some_and(|s|!s.is_empty()) && (channel.is_empty() || v["salesChannel"]==channel);Ok(json!({"measurementId":if enabled{measurement.clone()}else{Value::Null},"enabled":enabled}))},
        "sync" if ["gmail","google_analytics"].contains(&a)=>store.enqueue(t,a,&text(v,"requestKey"),&json!({"operation":"sync"})).await,
        "channels" if a=="slack"=>{let data=network::request(&format!("{}/conversations.list?exclude_archived=true&limit=200&types=public_channel,private_channel",network::endpoint("slack")?),None,Some(&oauth::token(store,t,a).await?),false).await?;checked(data["ok"]==true,"Slack channel listing rejected")?;Ok(json!({"channels":data["channels"].as_array().into_iter().flatten().map(|c|json!({"id":c["id"],"name":c["name"],"member":c["is_member"]==true})).collect::<Vec<_>>()}))},
        "labels" if a=="gmail"=>network::request(&format!("{}/users/me/labels",network::endpoint("gmail")?),None,Some(&oauth::token(store,t,a).await?),false).await,
        "post_order" if a=="slack"=>store.enqueue(t,a,&text(v,"requestKey"),&json!({"operation":"post","channel":v["channel"],"template":v["template"],"event":v.get("event").cloned().unwrap_or(json!({})),"kind":v["kind"].as_str().unwrap_or("order.placed"),"deliveryKey":v["requestKey"]})).await,
        _=>Err(Error::Invalid("Unknown connector action")),
    }
}
async fn configure(store: &Store, t: &str, a: &str, v: &Value) -> Result<Value> {
    let s = &v["settings"];
    let obj = s
        .as_object()
        .ok_or(Error::Invalid("Settings must be an object"))?;
    let allowed = match a {
        "google_analytics" => vec!["measurementId", "propertyId", "salesChannel"],
        "gmail" => vec!["labelId"],
        _ => vec!["channelId", "notifyOrders", "template"],
    };
    checked(
        obj.keys().all(|k| allowed.contains(&k.as_str()))
            && obj.iter().all(|(k, v)| {
                if k == "notifyOrders" {
                    v.is_boolean()
                } else {
                    v.is_string()
                }
            })
            && s.to_string().len() <= 4000,
        "Unknown or invalid connector setting",
    )?;
    for (key, pattern) in [
        ("measurementId", r"^G-[A-Z0-9]{4,20}$"),
        ("propertyId", r"^[0-9]+$"),
        ("channelId", r"^[CG][A-Z0-9]{6,30}$"),
    ] {
        if let Some(value) = s[key].as_str().filter(|s| !s.is_empty()) {
            checked(
                regex::Regex::new(pattern).unwrap().is_match(value),
                "Invalid connector identifier",
            )?;
        }
    }
    let mut tx = store.tx(t).await?;
    store.lock(&mut tx, t, a).await?;
    let mut current = store.get_tx(&mut tx, t, a).await?;
    if current["revision"] != v["revision"] {
        return Err(Error::Conflict);
    }
    if current["settings"]["labelId"] != s["labelId"] {
        current.as_object_mut().unwrap().remove("historyId");
    }
    current["settings"] = s.clone();
    current["revision"] = json!(current["revision"].as_u64().unwrap_or(0) + 1);
    store.save(&mut tx, t, a, &current).await?;
    tx.commit().await?;
    public(store, t, a).await
}
pub async fn handle(store: &Store, t: &str, a: &str, path: &str, v: &Value) -> Result<Value> {
    checked(
        APPS.contains(&a)
            && regex::Regex::new(r"^[a-z0-9][a-z0-9-]{1,47}$")
                .unwrap()
                .is_match(t),
        "Invalid app or shop",
    )?;
    // A trusted gateway token authenticates the caller; an existing live tenant is still required.
    let mut tx = store.tx(t).await?;
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1)")
        .bind(t)
        .fetch_one(&mut *tx)
        .await?;
    drop(tx);
    checked(exists, "Unknown shop")?;
    if let Some(name) = path.strip_prefix("actions/") {
        return action(store, t, a, name, v).await;
    }
    match path {
        "exports" => store.exports(t, a, v["cursor"].as_i64().unwrap_or(0)).await,
        "events" => {
            if a == "email" {
                return email::event(store, t, v).await;
            }
            if a == "slack"
                && store.get(t, a).await?["settings"]["notifyOrders"] == true
                && v["kind"] == "order.placed"
            {
                return action(
                    store,
                    t,
                    a,
                    "post_order",
                    &json!({"requestKey":v["idempotencyKey"],"event":v["data"],"kind":v["kind"]}),
                )
                .await;
            }
            Ok(json!({"ignored":true}))
        }
        _ => Err(Error::Invalid("Unknown app endpoint")),
    }
}
