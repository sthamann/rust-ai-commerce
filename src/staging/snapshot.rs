//! Fixed publishable units: product content/translations, settings, experience and app packages.
use super::*;
pub(crate) type Tx<'a> = sqlx::Transaction<'a, sqlx::Postgres>;
pub(crate) async fn snapshot(tx: &mut Tx<'_>, t: &str) -> Result<Value> {
    let mut result = serde_json::Map::new();
    let rows=sqlx::query("SELECT to_jsonb(p)-'tenant'-'stock'-'revision' AS data FROM products p WHERE tenant=$1 ORDER BY id FOR UPDATE").bind(t).fetch_all(&mut **tx).await?;
    for r in rows {
        let mut value: Value = r.get("data");
        let id = value["id"].as_str().unwrap().to_string();
        let trs=sqlx::query("SELECT language_id,name,description FROM product_translations WHERE tenant=$1 AND product_id=$2 ORDER BY language_id FOR UPDATE").bind(t).bind(&id).fetch_all(&mut **tx).await?;
        value["translations"]=json!(trs.iter().map(|r|json!({"language_id":r.get::<String,_>("language_id"),"name":r.get::<Option<String>,_>("name"),"description":r.get::<Option<String>,_>("description")})).collect::<Vec<_>>());
        result.insert(format!("product:{id}"), value);
    }
    for (key, table) in [
        ("settings", "commerce_settings"),
        ("experience", "experiences"),
    ] {
        let sql = format!("SELECT data FROM {table} WHERE tenant=$1 FOR UPDATE");
        if let Some(data) = sqlx::query_scalar::<_, Value>(sqlx::AssertSqlSafe(sql.as_str()))
            .bind(t)
            .fetch_optional(&mut **tx)
            .await?
        {
            result.insert(key.into(), data);
        }
    }
    for r in sqlx::query(
        "SELECT id,manifest,active FROM app_packages WHERE tenant=$1 ORDER BY id FOR UPDATE",
    )
    .bind(t)
    .fetch_all(&mut **tx)
    .await?
    {
        let app: String = r.get("id");
        let manifest: Value = r.get("manifest");
        let m: apps::Manifest =
            serde_json::from_value(manifest.clone()).map_err(|_| bad("Invalid app"))?;
        result.insert(
            format!("app:{app}"),
            json!({"manifest":manifest,"active":r.get::<bool,_>("active")}),
        );
        sqlx::query("SELECT set_config('rac.tenant',$1,true)")
            .bind(t)
            .execute(&mut **tx)
            .await?;
        for e in &m.entities {
            let columns = e
                .fields
                .iter()
                .map(|f| f.name.as_str())
                .collect::<Vec<_>>()
                .join(",");
            let sql = format!(
                "SELECT to_jsonb(r) AS data FROM (SELECT id,{columns} FROM public.{} WHERE tenant=$1 ORDER BY id LIMIT 1001 FOR UPDATE) r",
                apps::table(&app, &e.name)
            );
            let records = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
                .bind(t)
                .fetch_all(&mut **tx)
                .await?;
            if records.len() > 1000 {
                return Err(bad(
                    "Prototype release supports at most 1000 records per app entity",
                ));
            }
            for r in records {
                let data: Value = r.get("data");
                result.insert(
                    format!("appdata:{app}:{}:{}", e.name, data["id"].as_str().unwrap()),
                    data,
                );
            }
        }
    }
    for (kind, table) in [
        ("rule", "commerce_rules"),
        ("promotion", "commerce_promotions"),
        ("flow", "commerce_flows"),
        ("channel", "sales_channels"),
    ] {
        let sql = if kind == "rule" {
            format!(
                "SELECT id,jsonb_build_object('name',name,'condition',condition,'active',active) AS data FROM {table} WHERE tenant=$1 ORDER BY id FOR UPDATE"
            )
        } else {
            format!("SELECT id,data FROM {table} WHERE tenant=$1 ORDER BY id FOR UPDATE")
        };
        for r in sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
            .bind(t)
            .fetch_all(&mut **tx)
            .await?
        {
            result.insert(
                format!("{kind}:{}", r.get::<String, _>("id")),
                r.get::<Value, _>("data"),
            );
        }
    }
    documents::snapshot(tx, t, &mut result).await?;
    Ok(Value::Object(result))
}
pub(crate) async fn product_content(tx: &mut Tx<'_>, t: &str, value: &Value) -> Result<()> {
    let id = value["id"].as_str().ok_or(bad("Product ID required"))?;
    // Explicit allowlist preserves independently changing stock and never copies tenant keys.
    let n=sqlx::query("UPDATE products SET (name,category,description,price,tax_rate,list_price,regulation_price,reference_price,advanced_prices,min_purchase,purchase_steps,max_purchase,parent_id,options,media,properties,delivery_days,extra)=(SELECT x.name,x.category,x.description,x.price,x.tax_rate,x.list_price,x.regulation_price,x.reference_price,x.advanced_prices,x.min_purchase,x.purchase_steps,x.max_purchase,x.parent_id,x.options,x.media,x.properties,x.delivery_days,x.extra FROM jsonb_populate_record(NULL::products,$1) x),revision=revision+1 WHERE tenant=$2 AND id=$3").bind(value).bind(t).bind(id).execute(&mut **tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict(
            "Product creation/deletion needs an explicit catalog migration",
        ));
    }
    for tr in value["translations"]
        .as_array()
        .ok_or(bad("Translations required"))?
    {
        sqlx::query("INSERT INTO product_translations(tenant,product_id,language_id,name,description) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,product_id,language_id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description")
            .bind(t).bind(id).bind(tr["language_id"].as_str()).bind(tr["name"].as_str()).bind(tr["description"].as_str()).execute(&mut **tx).await?;
    }
    let r = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
        .bind(t)
        .bind(id)
        .fetch_one(&mut **tx)
        .await?;
    knowledge::sync_product(tx, t, &json!(crate::product(&r))).await?;
    Ok(())
}
