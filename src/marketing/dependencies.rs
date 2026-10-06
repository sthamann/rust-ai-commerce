//! Inspect tenant-owned definition references and durable uses before configuration deletion.
use super::*;

pub(super) fn references(v: &Value, kind: &str, id: &str) -> bool {
    match v {
        Value::Object(o) => {
            let rule = kind == "rules"
                && o.get("type").and_then(Value::as_str) == Some("ruleReference")
                && o.get("ruleId").and_then(Value::as_str) == Some(id);
            let channel = kind == "channels"
                && (o.get("type").and_then(Value::as_str) == Some("salesChannel")
                    || o.get("name").and_then(Value::as_str) == Some("salesChannel"))
                && [
                    o.get("values"),
                    o.get("config").and_then(|c| c.get("salesChannelIds")),
                ]
                .into_iter()
                .flatten()
                .any(|v| {
                    v.as_array()
                        .is_some_and(|a| a.iter().any(|v| v.as_str() == Some(id)))
                });
            rule || channel || o.values().any(|v| references(v, kind, id))
        }
        Value::Array(a) => a.iter().any(|v| references(v, kind, id)),
        _ => false,
    }
}
pub(super) async fn inspect(
    conn: &mut sqlx::PgConnection,
    t: &str,
    kind: &str,
    id: &str,
) -> Result<Value> {
    let mut deps = Vec::<Value>::new();
    if kind == "channels" && id == "default" {
        deps.push(json!({"kind":"default_channel","id":id,"count":1}));
    }
    if kind == "rules" || kind == "channels" {
        for (other, table) in [
            ("rules", "commerce_rules"),
            ("promotions", "commerce_promotions"),
            ("flows", "commerce_flows"),
        ] {
            let data = if other == "rules" {
                "jsonb_build_object('name',name,'condition',condition)"
            } else {
                "data"
            };
            let sql = format!("SELECT id,{data} AS data FROM {table} WHERE tenant=$1");
            for row in sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
                .bind(t)
                .fetch_all(&mut *conn)
                .await?
            {
                let other_id: String = row.get("id");
                let data: Value = row.get("data");
                if !(other == kind && other_id == id) && references(&data, kind, id) {
                    deps.push(json!({"kind":other,"id":other_id,"name":data["name"],"count":1}));
                }
            }
        }
        for (scope, sql) in [
            (
                "settings",
                "SELECT 'default' AS id,data FROM commerce_settings WHERE tenant=$1",
            ),
            (
                "channel_settings",
                "SELECT channel_id AS id,data FROM commerce_overrides WHERE tenant=$1",
            ),
        ] {
            for row in sqlx::query(sql).bind(t).fetch_all(&mut *conn).await? {
                if references(&row.get::<Value, _>("data"), kind, id) {
                    deps.push(json!({"kind":scope,"id":row.get::<String,_>("id"),"count":1}));
                }
            }
        }
    }
    let counts: &[(&str, &str)] = match kind {
        "promotions" => &[(
            "orders",
            "SELECT count(*) FROM promotion_uses WHERE tenant=$1 AND promotion=$2",
        )],
        "flows" => &[(
            "pending_jobs",
            "SELECT count(*) FROM flow_jobs WHERE tenant=$1 AND flow=$2 AND state IN ('queued','running','uncertain')",
        )],
        "channels" => &[
            (
                "orders",
                "SELECT count(*) FROM orders WHERE tenant=$1 AND data->>'salesChannelId'=$2",
            ),
            (
                "carts",
                "SELECT count(*) FROM carts WHERE tenant=$1 AND sales_channel_id=$2",
            ),
            (
                "customers",
                "SELECT count(*) FROM customers WHERE tenant=$1 AND sales_channel_id=$2",
            ),
            (
                "product_visibility",
                "SELECT count(*) FROM product_channel_visibility WHERE tenant=$1 AND channel_id=$2",
            ),
            (
                "company_settings",
                "SELECT count(*) FROM company_overrides WHERE tenant=$1 AND channel_id=$2",
            ),
            (
                "channel_settings",
                "SELECT count(*) FROM commerce_overrides WHERE tenant=$1 AND channel_id=$2",
            ),
        ],
        _ => &[],
    };
    for (scope, sql) in counts {
        let count: i64 = sqlx::query_scalar(*sql)
            .bind(t)
            .bind(id)
            .fetch_one(&mut *conn)
            .await?;
        if count > 0 {
            deps.push(json!({"kind":scope,"id":id,"count":count}));
        }
    }
    Ok(json!({"blocked":!deps.is_empty(),"dependencies":deps}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn references_are_semantic_and_nested() {
        let v = json!({"pipeline":{"nodes":[{"condition":{"type":"ruleReference","ruleId":"r"}}]}});
        assert!(references(&v, "rules", "r"));
        assert!(!references(&v, "rules", "other"));
        assert!(!references(
            &json!({"instruction":"r","ruleId":"r"}),
            "rules",
            "r"
        ));
        assert!(references(
            &json!({"type":"salesChannel","values":["c"]}),
            "channels",
            "c"
        ));
        assert!(references(
            &json!({"type":"shopwareCondition","name":"salesChannel","config":{"salesChannelIds":["c"]}}),
            "channels",
            "c"
        ));
        assert!(!references(&v, "channels", "r"));
    }
}
