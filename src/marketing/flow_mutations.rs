//! Local flow mutations journal the effect in the same transaction; customer authority changes revoke existing sessions.
use super::*;
pub(crate) async fn execute(
    a: &App,
    t: &str,
    f: &flows::Flow,
    key: &str,
    action: &str,
    config: &Value,
    id: &str,
) -> Result<Value> {
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,33))")
        .bind(format!("flow-effect:{t}:{key}"))
        .execute(&mut *tx)
        .await?;
    if let Some(v) = sqlx::query_scalar::<_, Value>(
        "SELECT data FROM order_activity WHERE tenant=$1 AND order_id=$2 AND data->>'flowKey'=$3",
    )
    .bind(t)
    .bind(id)
    .bind(key)
    .fetch_optional(&mut *tx)
    .await?
    {
        return Ok(v);
    }
    let mut order: Value =
        sqlx::query_scalar("SELECT data FROM orders WHERE tenant=$1 AND id=$2 FOR UPDATE")
            .bind(t)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
    let customer_id = order["orderCustomer"]["customerId"]
        .as_str()
        .map(String::from);
    let customer = action.contains("customer");
    let group = action == "action.set.customer.group.custom.field";
    let mut data = if group {
        let row = sqlx::query_scalar::<_, String>(
            "SELECT group_name FROM customers WHERE tenant=$1 AND id=$2 FOR UPDATE",
        )
        .bind(t)
        .bind(&customer_id)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO commerce_customer_groups(tenant,id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(t)
        .bind(&row)
        .execute(&mut *tx)
        .await?;
        sqlx::query_scalar::<_, Value>(
            "SELECT data FROM commerce_customer_groups WHERE tenant=$1 AND id=$2 FOR UPDATE",
        )
        .bind(t)
        .bind(row)
        .fetch_one(&mut *tx)
        .await?
    } else if customer {
        sqlx::query_scalar::<_, Value>(
            "SELECT automation FROM customers WHERE tenant=$1 AND id=$2 FOR UPDATE",
        )
        .bind(t)
        .bind(&customer_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(bad("Flow customer unavailable"))?
    } else {
        order.get("automation").cloned().unwrap_or(json!({}))
    };
    if action.ends_with(".tag") {
        let mut tags = data["tags"].as_array().cloned().unwrap_or_default();
        for tag in config["tags"].as_array().unwrap() {
            if action.contains(".remove.") {
                tags.retain(|v| v != tag)
            } else if !tags.contains(tag) {
                tags.push(tag.clone())
            }
        }
        data["tags"] = json!(tags);
    } else if action.contains("custom.field") {
        if !data["customFields"].is_object() {
            data["customFields"] = json!({})
        }
        data["customFields"][config["field"].as_str().unwrap()] = config["value"].clone();
    } else if action.ends_with("affiliate.and.campaign.code") {
        data["affiliateCode"] = config["affiliateCode"].clone();
        data["campaignCode"] = config["campaignCode"].clone();
        if !customer {
            order["affiliateCode"] = config["affiliateCode"].clone();
            order["campaignCode"] = config["campaignCode"].clone();
        }
    } else if action == "action.grant.download.access" {
        if config["value"] == false {
            sqlx::query("DELETE FROM order_downloads WHERE tenant=$1 AND order_id=$2")
                .bind(t)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        } else {
            sqlx::query("INSERT INTO order_downloads(tenant,order_id,asset_id) SELECT $1,$2,a.id FROM product_assets a WHERE a.tenant=$1 AND a.kind='download' AND EXISTS(SELECT 1 FROM jsonb_array_elements($3->'cart'->'lineItems') l WHERE l->>'referencedId'=a.product_id) ON CONFLICT DO NOTHING").bind(t).bind(id).bind(&order).execute(&mut *tx).await?;
        }
    } else if action == "action.change.customer.group" || action == "action.change.customer.status"
    {
        let n=sqlx::query("UPDATE customers SET group_name=COALESCE($1,group_name),active=COALESCE($2,active),revision=revision+1 WHERE tenant=$3 AND id=$4").bind(config["groupId"].as_str()).bind(config["active"].as_bool()).bind(t).bind(&customer_id).execute(&mut *tx).await?.rows_affected();
        if n != 1 {
            return Err(bad("Flow customer unavailable"));
        }
        sqlx::query("DELETE FROM customer_sessions WHERE tenant=$1 AND email=(SELECT email FROM customers WHERE tenant=$1 AND id=$2)").bind(t).bind(&customer_id).execute(&mut *tx).await?;
        sqlx::query("UPDATE carts SET token=md5(id||$1),data=jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,'{email}','null'),'{customer_id}','null'),'{group}','\"consumer\"'),'{company}','null'),revision=revision+1 WHERE tenant=$2 AND data->>'customer_id'=$3 AND status='open'").bind(uid()).bind(t).bind(&customer_id).execute(&mut *tx).await?;
    } else if action != "note" {
        return Err(bad("Unsupported local action"));
    }
    if group {
        sqlx::query("UPDATE commerce_customer_groups SET data=$1,revision=revision+1 WHERE tenant=$2 AND id=(SELECT group_name FROM customers WHERE tenant=$2 AND id=$3)").bind(data).bind(t).bind(&customer_id).execute(&mut *tx).await?;
    } else if customer
        && action != "action.change.customer.group"
        && action != "action.change.customer.status"
    {
        sqlx::query(
            "UPDATE customers SET automation=$1,revision=revision+1 WHERE tenant=$2 AND id=$3",
        )
        .bind(data)
        .bind(t)
        .bind(&customer_id)
        .execute(&mut *tx)
        .await?;
    } else if !customer && action != "note" && action != "action.grant.download.access" {
        order["automation"] = data;
        order["revision"] = json!(order["revision"].as_i64().unwrap_or(1) + 1);
        sqlx::query("UPDATE orders SET data=$1 WHERE tenant=$2 AND id=$3")
            .bind(&order)
            .bind(t)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    let (settings, _) = commerce::config(a, t).await?;
    let result = json!({"flowKey":key,"action":action,"orderId":id,"text":super::flow_text::effective(&config["instruction"], &f.locale, &settings.main_locale),"config":config});
    sqlx::query(
        "INSERT INTO order_activity(tenant,order_id,actor,kind,data) VALUES($1,$2,$3,'flow',$4)",
    )
    .bind(t)
    .bind(id)
    .bind(&f.actor)
    .bind(&result)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(result)
}
