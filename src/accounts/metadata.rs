//! Standard customer read fields and indexed order metrics are derived from authoritative records.
use crate::*;
pub(crate) async fn decorate(a: &App, t: &str, email: &str, v: &mut Value) -> Result<()> {
    project_contacts(v);
    let r=sqlx::query("SELECT sales_channel_id,language_id,first_login::text AS first_login,last_login::text AS last_login,last_payment_method_id FROM customers WHERE tenant=$1 AND email=$2").bind(t).bind(email).fetch_one(&a.db).await?;
    v["salesChannelId"] = json!(r.get::<String, _>("sales_channel_id"));
    v["languageId"] = json!(r.get::<String, _>("language_id"));
    v["firstLogin"] = json!(r.get::<Option<String>, _>("first_login"));
    v["lastLogin"] = json!(r.get::<Option<String>, _>("last_login"));
    v["lastPaymentMethodId"] = json!(r.get::<Option<String>, _>("last_payment_method_id"));
    v["groupId"] = v["customerGroup"].clone();
    v["guest"] = json!(false);
    let stats=sqlx::query("SELECT count(*) AS count,coalesce(sum((data->'cart'->'price'->>'totalPrice')::numeric),0)::double precision AS amount,max(created_at)::text AS last_order FROM orders WHERE tenant=$1 AND data->'orderCustomer'->>'customerId'=$2").bind(t).bind(v["id"].as_str()).fetch_one(&a.db).await?;
    v["orderCount"] = json!(stats.get::<i64, _>("count"));
    v["orderTotalAmount"] = json!(stats.get::<f64, _>("amount"));
    v["lastOrderDate"] = json!(stats.get::<Option<String>, _>("last_order"));
    Ok(())
}
fn project_contacts(v: &mut Value) {
    for key in [
        "name",
        "firstName",
        "lastName",
        "salutationId",
        "title",
        "phoneNumber",
        "birthday",
        "vatIds",
        "defaultPaymentMethodId",
    ] {
        if let Some(value) = v["profile"].get(key).cloned() {
            v[key] = value;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_profile_cannot_replace_account_authority() {
        let mut v = json!({"id":"own-id","email":"own@example.test","active":true,"profile":{"id":"foreign-id","email":"foreign@example.test","active":false,"customerGroup":"business","password_hash":"secret","firstName":"Alex"}});
        project_contacts(&mut v);
        assert_eq!(v["id"], "own-id");
        assert_eq!(v["email"], "own@example.test");
        assert_eq!(v["active"], true);
        assert_eq!(v["firstName"], "Alex");
        assert!(v.get("password_hash").is_none());
        assert!(v.get("customerGroup").is_none());
    }
}
