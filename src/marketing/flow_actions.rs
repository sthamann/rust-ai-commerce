//! Native action schema and permissions use original Core names; no arbitrary SQL, shell or unguarded payment transitions.
use super::*;
pub(crate) const ACTIONS: &[&str] = &[
    "note",
    "ai_proposal",
    "app_action",
    "action.add.customer.tag",
    "action.remove.customer.tag",
    "action.add.order.tag",
    "action.remove.order.tag",
    "action.set.customer.custom.field",
    "action.set.order.custom.field",
    "action.set.customer.group.custom.field",
    "action.add.customer.affiliate.and.campaign.code",
    "action.add.order.affiliate.and.campaign.code",
    "action.change.customer.group",
    "action.change.customer.status",
    "action.set.order.state",
    "action.generate.document",
    "action.grant.download.access",
    "action.mail.send",
    "action.stop.flow",
];
pub(crate) fn permission(action: &str) -> &'static str {
    if action.contains("customer") {
        "customers.write"
    } else {
        match action {
            "action.generate.document" => "documents.create",
            "action.mail.send" | "app_action" => "apps.manage",
            "ai_proposal" => "catalog.write",
            "note" | "action.stop.flow" => "settings.write",
            _ => "orders.write",
        }
    }
}
pub(crate) fn normalize(action: &str, config: &Value) -> Value {
    let mut c = config.clone();
    for (source, native) in [
        ("tagIds", "tags"),
        ("customerGroupId", "groupId"),
        ("documentType", "kind"),
    ] {
        if c.get(native).is_none() && c.get(source).is_some() {
            c[native] = c[source].clone();
        }
    }
    if action == "action.grant.download.access" && c.get("value").is_none() {
        c["value"] = json!(true);
    }
    c
}
pub(crate) fn validate(action: &str, config: &Value) -> Result<()> {
    let normalized = normalize(action, config);
    let config = &normalized;
    if !ACTIONS.contains(&action) || !config.is_object() || config.to_string().len() > 8000 {
        return Err(bad("Unknown flow action or invalid configuration"));
    }
    if matches!(action, "note" | "ai_proposal") {
        super::flow_text::shape(&config["instruction"])?;
    }
    let require = |key: &str| {
        config[key]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 254)
            .ok_or(bad(format!("Flow action requires {key}")))
    };
    if action.ends_with(".tag")
        && config["tags"].as_array().is_none_or(|a| {
            a.is_empty()
                || a.len() > 50
                || a.iter()
                    .any(|v| v.as_str().is_none_or(|s| s.is_empty() || s.len() > 100))
        })
    {
        return Err(bad("Flow tags required"));
    }
    if action.contains("custom.field") {
        require("field")?;
        if config["field"]
            .as_str()
            .unwrap()
            .contains(['.', '/', '[', ']'])
            || config.get("value").is_none()
        {
            return Err(bad("Custom field key and value required"));
        }
    }
    if action == "action.change.customer.group" {
        require("groupId")?;
        if !["consumer", "business"].contains(&config["groupId"].as_str().unwrap()) {
            return Err(bad("Unknown native customer group"));
        }
    }
    if action == "action.change.customer.status" && !config["active"].is_boolean() {
        return Err(bad("Customer active flag required"));
    }
    if action == "action.grant.download.access" && !config["value"].is_boolean() {
        return Err(bad("Download access boolean required"));
    }
    if action == "action.set.order.state" {
        require("kind")?;
        require("state")?;
    }
    if action == "action.generate.document" {
        require("kind")?;
        if !["invoice", "delivery_note"].contains(&config["kind"].as_str().unwrap()) {
            return Err(bad("Unsupported automatic document kind"));
        }
    }
    if action == "app_action" {
        require("app")?;
        require("action")?;
        if !config["arguments"].is_object() {
            return Err(bad("App arguments object required"));
        }
    }
    if action == "action.mail.send" {
        require("templateId")?;
        if config["templateId"] != "order_confirmation" {
            return Err(bad("Unknown installed email template"));
        }
    }
    if action.ends_with("affiliate.and.campaign.code") {
        require("affiliateCode")?;
        require("campaignCode")?;
    }
    Ok(())
}
pub(crate) async fn execute(
    a: &App,
    t: &str,
    f: &flows::Flow,
    key: &str,
    action: &str,
    config: &Value,
    definition: &Value,
) -> Result<Value> {
    let normalized = normalize(action, config);
    let config = &normalized;
    validate(action, config)?;
    let h = super::flow_access::headers(a, t, f.actor.as_deref()).await?;
    auth::permit(&h, permission(action))?;
    if action == "ai_proposal" {
        auth::permit(&h, "knowledge.read")?;
        let (settings, _) = commerce::config(a, t).await?;
        let instruction =
            super::flow_text::effective(&config["instruction"], &f.locale, &settings.main_locale);
        return plan_with(
            a,
            t,
            &format!(
                "Flow event {}. {}. Create a reviewable proposal only.",
                definition["event"], instruction
            ),
            f.inference.as_ref(),
            "",
            &f.locale,
        )
        .await;
    }
    if action == "app_action" || action == "action.mail.send" {
        let mut step = f.clone();
        step.action = "app_action".into();
        step.app_action = Some(flows::AppFlowAction {
            app: config["app"]
                .as_str()
                .unwrap_or(if action == "action.mail.send" {
                    "email"
                } else {
                    ""
                })
                .into(),
            action: config["action"].as_str().unwrap_or("send_order").into(),
            arguments: if action == "action.mail.send" {
                json!({"locale":&f.locale[..2],"dryRun":false})
            } else {
                config["arguments"].clone()
            },
        });
        return execute_app_flow(a, t, &step, key, "", definition).await;
    }
    let id = definition["orderId"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or(bad("Action requires an order event"))?;
    if action == "action.set.order.state" || action == "action.generate.document" {
        let o: Value = sqlx::query_scalar("SELECT data FROM orders WHERE tenant=$1 AND id=$2")
            .bind(t)
            .bind(id)
            .fetch_one(&a.db)
            .await?;
        let mut args = config.clone();
        args["id"] = json!(id);
        args["revision"] = o["revision"].clone();
        args["requestKey"] = json!(key);
        args["locale"] = json!(&f.locale[..2]);
        let value = operations::invoke(
            a,
            &h,
            if action == "action.set.order.state" {
                "merchant.order.transition"
            } else {
                "merchant.receipt.create"
            },
            &args,
        )
        .await?;
        return Ok(
            json!({"orderId":id,"revision":value["revision"],"state":value["state"],"documentId":if action=="action.generate.document" {value["id"].clone()} else {Value::Null}}),
        );
    }
    super::flow_mutations::execute(a, t, f, key, action, config, id).await
}
