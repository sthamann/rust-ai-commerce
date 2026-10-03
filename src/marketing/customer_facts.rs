//! Customer rule authority is loaded by tenant and stable customer ID, with aggregate history and calendar age.
use super::*;
pub(super) async fn customer(
    conn: &mut sqlx::PgConnection,
    c: &StoredCart,
    facts: &Value,
) -> Result<Value> {
    let row=sqlx::query("SELECT *,extract(year FROM age(current_date,(profile->>'birthday')::date))::double precision AS age,abs(current_date-first_login::date)::double precision AS first_days,abs(current_date-last_login::date)::double precision AS last_days FROM customers WHERE tenant=$1 AND id=$2").bind(&c.tenant).bind(&c.data.customer_id).fetch_optional(&mut *conn).await?;
    let Some(r) = row else {
        return Ok(
            json!({"loggedIn":false,"guest":true,"email":null,"active":false,"group":c.data.group,"tags":[],"salutationId":null,"lastName":null,"customerNumber":null,"affiliateCode":null,"campaignCode":null,"requestedGroupId":null,"age":null,"orderCount":null,"orderTotalAmount":null,"reviewCount":null,"daysSinceFirstLogin":null,"daysSinceLastLogin":null,"daysSinceLastOrder":null,"isCompany":false,"newsletter":false,"createdByAdmin":false,"differentAddresses":false}),
        );
    };
    let profile: Value = r.get("profile");
    let a: Value = r.get("automation");
    let stats=sqlx::query("SELECT count(*) AS count,coalesce(sum((data->'cart'->'price'->>'totalPrice')::numeric),0)::double precision AS amount,abs(current_date-max(created_at)::date)::double precision AS days FROM orders WHERE tenant=$1 AND data->'orderCustomer'->>'customerId'=$2").bind(&c.tenant).bind(&c.data.customer_id).fetch_one(&mut *conn).await?;
    let reviews:i64=sqlx::query_scalar("SELECT count(*) FROM product_reviews WHERE tenant=$1 AND session=(SELECT email FROM customers WHERE tenant=$1 AND id=$2)").bind(&c.tenant).bind(&c.data.customer_id).fetch_one(&mut *conn).await?;
    Ok(
        json!({"loggedIn":true,"guest":false,"active":r.get::<bool,_>("active"),"email":r.get::<String,_>("email"),"group":r.get::<String,_>("group_name"),"customerNumber":r.get::<String,_>("customer_number"),"salutationId":profile["salutationId"],"lastName":profile["lastName"],"age":r.get::<Option<f64>,_>("age"),"birthday":profile["birthday"],"tags":a["tags"].as_array().cloned().unwrap_or_default(),"customFields":a["customFields"].as_object().cloned().unwrap_or_default(),"affiliateCode":a["affiliateCode"],"campaignCode":a["campaignCode"],"requestedGroupId":a["requestedGroupId"],"newsletter":a["newsletter"].as_bool().unwrap_or(false),"createdByAdmin":a["createdByAdmin"].as_bool().unwrap_or(false),"isCompany":r.get::<Option<String>,_>("company").is_some_and(|s|!s.is_empty()),"differentAddresses":facts["billing"]!=facts["shipping"],"orderCount":stats.get::<i64,_>("count"),"orderTotalAmount":stats.get::<f64,_>("amount"),"reviewCount":reviews,"daysSinceFirstLogin":r.get::<Option<f64>,_>("first_days"),"daysSinceLastLogin":r.get::<Option<f64>,_>("last_days"),"daysSinceLastOrder":stats.get::<Option<f64>,_>("days")}),
    )
}
