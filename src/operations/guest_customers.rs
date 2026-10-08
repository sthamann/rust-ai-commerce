//! Merchant-only guest contact projection; order snapshots never create account authority.
use crate::*;

pub(super) async fn contact(a: &App, t: &str, email: &str) -> Result<Value> {
    let r=sqlx::query("SELECT data,created_at::text AS created FROM orders WHERE tenant=$1 AND data->'orderCustomer'->>'email'=$2 AND data->'orderCustomer'->>'guest'='true' ORDER BY created_at DESC,id DESC LIMIT 1")
        .bind(t).bind(email).fetch_optional(&a.db).await?
        .ok_or(Error(StatusCode::NOT_FOUND,"Customer not found".into()))?;
    let data: Value = r.get("data");
    let mut profile = data["billingAddress"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    if let Some(contact) = data["orderCustomer"].as_object() {
        profile.extend(contact.clone());
    }
    Ok(
        json!({"id":null,"email":email,"customerNumber":null,"guest":true,
        "profile":profile,"company":data["billingAddress"]["company"],
        "customerGroup":data["customerGroup"],"active":false,"revision":null,
        "createdAt":r.get::<String,_>("created"),
        "billingAddress":data["billingAddress"],"shippingAddress":data["shippingAddress"]}),
    )
}
