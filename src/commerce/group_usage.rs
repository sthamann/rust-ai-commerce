//! Removing a customer group rejects live customer, price and native/source-rule dependencies under the settings lock.
use super::*;
fn references(v: &Value, ids: &[String]) -> bool {
    match v {
        Value::Object(o) => {
            let action = o
                .get("groupId")
                .and_then(Value::as_str)
                .is_some_and(|s| ids.iter().any(|id| id == s));
            let group = ["customerGroup", "customerCustomerGroup"].iter().any(|n| {
                o.get("type").and_then(Value::as_str) == Some(n)
                    || o.get("name").and_then(Value::as_str) == Some(n)
            });
            let field = o.get("path").and_then(Value::as_str).is_some_and(|p| {
                [
                    "customerGroup",
                    "customerGroupId",
                    "customer.customerGroupId",
                ]
                .contains(&p)
            });
            let contains = |v: &Value| {
                v.as_str().is_some_and(|s| ids.iter().any(|id| id == s))
                    || v.as_array().is_some_and(|a| {
                        a.iter()
                            .any(|v| v.as_str().is_some_and(|s| ids.iter().any(|id| id == s)))
                    })
            };
            action
                || (group
                    && ["values", "customerGroupIds", "groupIds"]
                        .iter()
                        .any(|k| o.get(*k).is_some_and(contains)))
                || (field && o.get("value").is_some_and(contains))
                || (group
                    && o.get("config").is_some_and(|c| {
                        ["customerGroupIds", "values", "groupIds"]
                            .iter()
                            .any(|k| c.get(*k).is_some_and(contains))
                    }))
                || o.values().any(|x| references(x, ids))
        }
        Value::Array(a) => a.iter().any(|v| references(v, ids)),
        _ => false,
    }
}
pub(super) async fn guard(
    tx: &mut sqlx::PgConnection,
    t: &str,
    old: &Settings,
    next: &Settings,
) -> Result<()> {
    let ids = next
        .customer_groups
        .iter()
        .map(|g| g.id.clone())
        .collect::<Vec<_>>();
    let used: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM customers WHERE tenant=$1 AND NOT(group_name=ANY($2)))",
    )
    .bind(t)
    .bind(&ids)
    .fetch_one(&mut *tx)
    .await?;
    if used {
        return Err(bad("Customer group is assigned to customers"));
    }
    let removed = old
        .customer_groups
        .iter()
        .filter(|g| !ids.contains(&g.id))
        .map(|g| g.id.clone())
        .collect::<Vec<_>>();
    if removed.is_empty() {
        return Ok(());
    }
    let price:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products p CROSS JOIN LATERAL jsonb_array_elements(p.advanced_prices) x WHERE tenant=$1 AND x->>'rule_id'=ANY($2))").bind(t).bind(&removed).fetch_one(&mut *tx).await?;
    if price {
        return Err(bad("Customer group is assigned to advanced prices"));
    }
    let rows:Vec<Value>=sqlx::query_scalar("SELECT condition AS data FROM commerce_rules WHERE tenant=$1 UNION ALL SELECT data FROM commerce_flows WHERE tenant=$1 UNION ALL SELECT data FROM commerce_promotions WHERE tenant=$1 UNION ALL SELECT data FROM commerce_overrides WHERE tenant=$1").bind(t).fetch_all(&mut *tx).await?;
    if rows.iter().any(|v| references(v, &removed)) || references(&json!(next.taxes), &removed) {
        return Err(bad("Customer group is used by a rule or flow"));
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_groups_in_native_and_source_conditions() {
        let ids = vec!["vip".into()];
        assert!(references(
            &json!({"children":[{"type":"customerGroup","values":["vip"]}]}),
            &ids
        ));
        assert!(references(
            &json!({"type":"shopwareCondition","name":"customerCustomerGroup","config":{"customerGroupIds":["vip"]}}),
            &ids
        ));
        assert!(!references(
            &json!({"name":"vip","type":"customerGroup","values":["other"]}),
            &ids
        ));
    }
}
