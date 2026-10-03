//! Durable order-event flows: conditions, shop notes and AI proposals; no unapproved model mutations.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Flow {
    pub name: HashMap<String, String>,
    pub active: bool,
    pub event: String,
    pub condition: rules::Condition,
    pub action: String,
    pub instruction: HashMap<String, String>,
    pub locale: String,
    #[serde(default)]
    pub inference: Option<Choice>,
    #[serde(default)]
    pub actor: Option<String>,
    #[serde(default)]
    pub app_action: Option<AppFlowAction>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AppFlowAction {
    pub app: String,
    pub action: String,
    #[serde(default)]
    pub arguments: Value,
}
impl Flow {
    pub(crate) fn validate(&self) -> Result<()> {
        self.condition.validate(0)?;
        if self.action == "app_action"
            && self.app_action.as_ref().is_none_or(|x| {
                !apps::identifier(&x.app)
                    || !apps::identifier(&x.action)
                    || !x.arguments.is_object()
                    || x.arguments.to_string().len() > 8000
            })
        {
            return Err(bad("Invalid flow app action"));
        }
        if ![
            "order.placed",
            "payment.captured",
            "order.state_changed",
            "payment.state_changed",
            "delivery.state_changed",
            "payment.updated",
        ]
        .contains(&self.event.as_str())
            && !valid_app_event(&self.event)
            || !["note", "ai_proposal", "app_action"].contains(&self.action.as_str())
            || !["de-DE", "en-GB", "fr-FR", "es-ES"].contains(&self.locale.as_str())
            || ["en", "de", "fr", "es"].iter().any(|l| {
                self.instruction
                    .get(*l)
                    .is_none_or(|s| s.trim().is_empty() || s.len() > 3200)
            })
        {
            return Err(bad("Unsupported flow action, event or locale"));
        }
        Ok(())
    }
}
pub(crate) async fn project_flows(
    tx: &mut sqlx::PgConnection,
    t: &str,
    event: i64,
    kind: &str,
    data: &Value,
) -> Result<()> {
    if ![
        "order.placed",
        "payment.captured",
        "order.state_changed",
        "payment.state_changed",
        "delivery.state_changed",
        "payment.updated",
    ]
    .contains(&kind)
        && !valid_app_event(kind)
    {
        return Ok(());
    }
    let rows = sqlx::query("SELECT id,data FROM commerce_flows WHERE tenant=$1 ORDER BY id")
        .bind(t)
        .fetch_all(&mut *tx)
        .await?;
    let order_id = data["orderId"].as_str().unwrap_or("");
    let order=sqlx::query("SELECT c.* ,o.data AS order_data FROM orders o JOIN carts c ON c.id=o.cart_id WHERE o.tenant=$1 AND o.id=$2").bind(t).bind(order_id).fetch_optional(&mut *tx).await?;
    let (cart, q) = if let Some(order) = order {
        (
            stored(&order)?,
            data.get("order")
                .cloned()
                .unwrap_or_else(|| order.get("order_data")),
        )
    } else {
        if !valid_app_event(kind) {
            return Ok(());
        }
        (StoredCart{id:String::new(),tenant:t.into(),token:String::new(),data:serde_json::from_value(json!({"items":[],"group":"consumer","email":null,"company":null,"session":"app-event","buyer":null,"order":null})).map_err(|_|bad("Invalid event context"))?,revision:0,status:"event".into()},json!({"cart":{}}))
    };
    let mut context = q["cart"].clone();
    context["event"] = data.clone();
    context["eventKind"] = json!(kind);
    context["orderState"] = q["state"].clone();
    context["paymentState"] = q["payment"]["state"].clone();
    context["deliveryStates"] = json!(
        q["deliveries"]
            .as_array()
            .map(|ds| ds.iter().map(|d| d["state"].clone()).collect::<Vec<_>>())
            .unwrap_or_default()
    );
    for row in rows {
        let f: Flow = serde_json::from_value(row.get("data")).map_err(|_| bad("Invalid flow"))?;
        if f.active && f.event == kind && f.condition.matches(&cart, &context) {
            sqlx::query("INSERT INTO flow_jobs(id,tenant,flow,event_id,definition) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,flow,event_id) DO NOTHING").bind(uid()).bind(t).bind(row.get::<String,_>("id")).bind(event).bind(json!({"flow":f,"orderId":order_id,"orderNumber":q["orderNumber"],"totalPrice":q["cart"]["price"]["totalPrice"],"event":kind,"transition":data,"eventContext":data,"orderSnapshot":{"orderCustomer":q["orderCustomer"],"currencyId":q["currencyId"],"orderNumber":q["orderNumber"],"state":q["state"],"cart":{"price":q["cart"]["price"]}}})).execute(&mut *tx).await?;
        }
    }
    Ok(())
}
pub(crate) async fn flow_once(a: &App) -> Result<()> {
    // Expired inference is uncertain, never automatically repeated into duplicate change proposals.
    sqlx::query("UPDATE flow_jobs SET state='uncertain',error='Worker stopped before result confirmation' WHERE state='running' AND lease_until<now()").execute(&a.db).await?;
    let mut tx = a.db.begin().await?;
    let row=sqlx::query("SELECT id,tenant,definition FROM flow_jobs WHERE state='queued' ORDER BY event_id LIMIT 1 FOR UPDATE SKIP LOCKED").fetch_optional(&mut *tx).await?;
    let Some(row) = row else { return Ok(()) };
    let id: String = row.get("id");
    let t: String = row.get("tenant");
    let definition: Value = row.get("definition");
    sqlx::query("UPDATE flow_jobs SET state='running',attempts=attempts+1,lease_until=now()+interval '5 minutes' WHERE id=$1").bind(&id).execute(&mut *tx).await?;
    tx.commit().await?;
    let f: Flow =
        serde_json::from_value(definition["flow"].clone()).map_err(|_| bad("Invalid flow"))?;
    let instruction = f
        .instruction
        .get(&f.locale[..2])
        .filter(|s| !s.trim().is_empty())
        .or_else(|| f.instruction.get("en"))
        .cloned()
        .unwrap_or_default();
    let authorized = if f.actor.as_deref() == Some("bootstrap") {
        true
    } else {
        sqlx::query_scalar::<_,bool>("SELECT EXISTS(SELECT 1 FROM memberships WHERE tenant=COALESCE((SELECT live_tenant FROM shop_environments WHERE tenant=$1),$1) AND user_id=$2 AND active AND (role='owner' OR (permissions='null'::jsonb AND role='admin') OR (permissions ? 'settings.write' AND ($3='note' OR $3='app_action' AND permissions ? 'apps.manage' OR $3='ai_proposal' AND permissions ? 'catalog.write' AND permissions ? 'knowledge.read'))))").bind(&t).bind(&f.actor).bind(&f.action).fetch_one(&a.db).await?
    };
    let result: Result<Value> = if !authorized {
        Err(Error(
            StatusCode::FORBIDDEN,
            "Flow owner lost access".into(),
        ))
    } else if f.action == "app_action" {
        execute_app_flow(a, &t, &f, &id, &instruction, &definition).await
    } else if f.action == "note" {
        Ok(json!({"note":instruction,"orderId":definition["orderId"],"locale":f.locale}))
    } else {
        let context = format!(
            "Flow event order {} total {}. {}. Create a reviewable proposal only.",
            definition["orderNumber"], definition["totalPrice"], instruction
        );
        plan_with(a, &t, &context, f.inference.as_ref(), "", &f.locale).await
    };
    let (state, value, error) = match result {
        Ok(v) => ("completed", Some(v), None),
        Err(e) => ("failed", None, Some(e.1)),
    };
    let mut tx = a.db.begin().await?;
    let n=sqlx::query("UPDATE flow_jobs SET state=$1,result=$2,error=$3,lease_until=NULL WHERE id=$4 AND state='running'").bind(state).bind(&value).bind(error).bind(&id).execute(&mut *tx).await?.rows_affected();
    if n == 1
        && state == "completed"
        && f.action == "note"
        && !definition["orderId"].as_str().unwrap_or("").is_empty()
    {
        sqlx::query("INSERT INTO order_activity(tenant,order_id,actor,kind,data) VALUES($1,$2,$3,'flow',$4)").bind(&t).bind(definition["orderId"].as_str().unwrap_or("")).bind(f.actor.as_deref().unwrap_or("flow")).bind(json!({"text":instruction,"flowJob":id,"event":definition["event"],"locale":f.locale})).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Only namespaced app events can extend the standard event catalogue.
pub(crate) fn valid_app_event(name: &str) -> bool {
    let parts = name.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts[0] == "app"
        && apps::identifier(parts[1])
        && apps::identifier(parts[2])
}
