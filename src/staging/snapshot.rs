//! Fixed publishable units: product content/translations, settings, experience and app packages.
use super::*;
pub(crate) type Tx<'a> = sqlx::Transaction<'a, sqlx::Postgres>;
pub(crate) async fn snapshot(tx: &mut Tx<'_>, t: &str) -> Result<Value> {
    let mut result = serde_json::Map::new();
    assets::snapshot_assets(tx, t, &mut result).await?;
    let rows=sqlx::query("SELECT to_jsonb(p)-'tenant'-'stock'-'revision' AS data FROM products p WHERE tenant=$1 ORDER BY id FOR UPDATE").bind(t).fetch_all(&mut **tx).await?;
    for r in rows {
        let mut value: Value = r.get("data");
        let id = value["id"].as_str().unwrap().to_string();
        let trs=sqlx::query("SELECT language_id,name,description FROM product_translations WHERE tenant=$1 AND product_id=$2 ORDER BY language_id FOR UPDATE").bind(t).bind(&id).fetch_all(&mut **tx).await?;
        value["translations"]=json!(trs.iter().map(|r|json!({"language_id":r.get::<String,_>("language_id"),"name":r.get::<Option<String>,_>("name"),"description":r.get::<Option<String>,_>("description")})).collect::<Vec<_>>());
        value["categoryIds"]=json!(sqlx::query_scalar::<_,String>("SELECT category_id FROM product_categories WHERE tenant=$1 AND product_id=$2 ORDER BY category_id").bind(t).bind(&id).fetch_all(&mut **tx).await?);
        value["channelVisibility"]=json!(sqlx::query("SELECT channel_id,visible FROM product_channel_visibility WHERE tenant=$1 AND product_id=$2 ORDER BY channel_id").bind(t).bind(&id).fetch_all(&mut **tx).await?.iter().map(|r|json!({"id":r.get::<String,_>("channel_id"),"visible":r.get::<bool,_>("visible")})).collect::<Vec<_>>());
        result.insert(format!("product:{id}"), value);
    }
    categories::snapshot(tx, t, &mut result).await?;
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
    let data: Option<Value> =
        sqlx::query_scalar("SELECT data FROM order_state_machines WHERE tenant=$1 FOR UPDATE")
            .bind(t)
            .fetch_optional(&mut **tx)
            .await?;
    result.insert(
        "order-workflow".into(),
        data.unwrap_or_else(|| json!(commerce::default_machine())),
    );
    documents::snapshot(tx, t, &mut result).await?;
    Ok(Value::Object(result))
}
pub(crate) async fn product_content(tx: &mut Tx<'_>, t: &str, value: &Value) -> Result<()> {
    let mut published = value.clone();
    live_asset_urls(&mut published, t);
    let value = &published;
    let id = value["id"].as_str().ok_or(bad("Product ID required"))?;
    // A new staged product enters live with zero inventory; stock remains an independent operational write.
    sqlx::query("INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock,active,product_number) VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9) ON CONFLICT(tenant,id) DO NOTHING").bind(t).bind(id).bind(value["name"].as_str()).bind(value["category"].as_str()).bind(value["description"].as_str()).bind(value["price"].as_f64()).bind(value["tax_rate"].as_f64()).bind(value["active"].as_bool().unwrap_or(true)).bind(value["product_number"].as_str()).execute(&mut **tx).await?;
    // Explicit allowlist preserves independently changing stock and never copies tenant keys.
    let n=sqlx::query("UPDATE products SET (name,category,description,price,tax_rate,list_price,regulation_price,reference_price,advanced_prices,min_purchase,purchase_steps,max_purchase,parent_id,options,media,properties,delivery_days,extra,active,product_number)=(SELECT x.name,x.category,x.description,x.price,x.tax_rate,x.list_price,x.regulation_price,x.reference_price,x.advanced_prices,x.min_purchase,x.purchase_steps,x.max_purchase,x.parent_id,x.options,x.media,x.properties,x.delivery_days,x.extra,x.active,x.product_number FROM jsonb_populate_record(NULL::products,$1) x),revision=revision+1 WHERE tenant=$2 AND id=$3").bind(value).bind(t).bind(id).execute(&mut **tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict(
            "Product creation/deletion needs an explicit catalog migration",
        ));
    }
    if let Some(ids) = value["categoryIds"].as_array() {
        crate::categories::assignments(
            tx,
            t,
            id,
            &ids.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect::<Vec<_>>(),
        )
        .await?;
    }
    if let Some(channels) = value["channelVisibility"].as_array() {
        sqlx::query("DELETE FROM product_channel_visibility WHERE tenant=$1 AND product_id=$2")
            .bind(t)
            .bind(id)
            .execute(&mut **tx)
            .await?;
        for channel in channels {
            sqlx::query("INSERT INTO product_channel_visibility VALUES($1,$2,$3,$4)")
                .bind(t)
                .bind(id)
                .bind(channel["id"].as_str())
                .bind(channel["visible"].as_bool())
                .execute(&mut **tx)
                .await?;
        }
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

/// Local asset IDs clone unchanged; their delivery tenant changes from private staging to live.
fn live_asset_urls(value: &mut Value, tenant: &str) {
    match value {
        Value::String(s) if s.starts_with("/store-api/assets/") => {
            if let Ok(mut url) = reqwest::Url::parse(&format!("https://local{s}")) {
                let pairs = url
                    .query_pairs()
                    .filter(|(k, _)| k != "shop")
                    .map(|(k, v)| (k.into_owned(), v.into_owned()))
                    .collect::<Vec<_>>();
                url.set_query(None);
                url.query_pairs_mut()
                    .extend_pairs(pairs)
                    .append_pair("shop", tenant);
                *s = format!("{}?{}", url.path(), url.query().unwrap_or_default());
            }
        }
        Value::Array(items) => {
            for item in items {
                live_asset_urls(item, tenant);
            }
        }
        Value::Object(fields) => {
            for item in fields.values_mut() {
                live_asset_urls(item, tenant);
            }
        }
        _ => {}
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn release_rebinds_only_local_asset_urls() {
        let mut value = json!({"media":[{"url":"/store-api/assets/image?shop=stage"}],"external":"https://example.test/?shop=stage"});
        live_asset_urls(&mut value, "live");
        assert_eq!(
            value["media"][0]["url"],
            "/store-api/assets/image?shop=live"
        );
        assert_eq!(value["external"], "https://example.test/?shop=stage");
    }
}
