//! Public synthetic fashion template; provisioning copies only this versioned fixture into a new tenant.
use crate::*;

pub(crate) fn template() -> Value {
    serde_json::from_str(include_str!("../fixtures/fashion-catalog.json"))
        .expect("valid bundled fashion catalogue")
}

pub(crate) async fn insert(tx: &mut sqlx::PgConnection, tenant: &str) -> Result<()> {
    let source = match env::var("DEMO_CATALOG").as_deref() {
        Ok("legacy-furniture") => {
            serde_json::from_str(include_str!("../fixtures/demo-catalog.json")).unwrap()
        }
        Ok("fashion") | Err(_) => template(),
        Ok(_) => return Err(bad("Unsupported demo catalogue")),
    };
    insert_value(tx, tenant, source).await
}

async fn insert_value(tx: &mut sqlx::PgConnection, tenant: &str, template: Value) -> Result<()> {
    for p in template["products"].as_array().unwrap() {
        sqlx::query("INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock,revision,list_price,regulation_price,reference_price,advanced_prices,min_purchase,purchase_steps,max_purchase,parent_id,options,media,properties,delivery_days,extra) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)")
            .bind(tenant).bind(p["id"].as_str()).bind(p["name"].as_str()).bind(p["category"].as_str()).bind(p["description"].as_str())
            .bind(p["price"].as_f64()).bind(p["tax_rate"].as_f64()).bind(p["stock"].as_i64().unwrap() as i32)
            .bind(p["list_price"].as_f64()).bind(p["regulation_price"].as_f64()).bind(p["reference_price"].as_object().map(|_|p["reference_price"].clone()))
            .bind(&p["advanced_prices"]).bind(p["min_purchase"].as_i64().unwrap() as i32).bind(p["purchase_steps"].as_i64().unwrap() as i32)
            .bind(p["max_purchase"].as_i64().map(|v|v as i32)).bind(p["parent_id"].as_str()).bind(&p["options"]).bind(&p["media"]).bind(&p["properties"])
            .bind(p["delivery_days"].as_i64().unwrap() as i32).bind(p.get("extra").cloned().unwrap_or(json!({}))).execute(&mut *tx).await?;
    }
    for tr in template["translations"].as_array().unwrap() {
        sqlx::query("INSERT INTO product_translations(tenant,product_id,language_id,name,description) VALUES($1,$2,$3,$4,$5)")
            .bind(tenant).bind(tr["product_id"].as_str()).bind(tr["language_id"].as_str()).bind(tr["name"].as_str()).bind(tr["description"].as_str()).execute(&mut *tx).await?;
    }
    Ok(())
}

/// An opt-in built-in demo is added once; subsequent starts never replace merchant edits or orders.
pub(crate) async fn seed_builtin(a: &App) -> Result<()> {
    let mut tx = a.db.begin().await?;
    let created = sqlx::query(
        "INSERT INTO tenants(id,name) VALUES('nord-atelier','Nord Atelier') ON CONFLICT DO NOTHING",
    )
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if created == 0 {
        return Ok(());
    }
    insert_value(&mut tx, "nord-atelier", template()).await?;
    let settings: Value =
        serde_json::from_str(include_str!("../fixtures/demo-settings.json")).unwrap();
    sqlx::query("INSERT INTO commerce_settings(tenant,data) VALUES('nord-atelier',$1)")
        .bind(settings)
        .execute(&mut *tx)
        .await?;
    sqlx::query("SELECT public.seed_shop_automation('nord-atelier')")
        .execute(&mut *tx)
        .await?;
    crate::categories::seed(&mut tx, "nord-atelier").await?;
    categories(&mut tx, "nord-atelier").await?;
    sqlx::query("INSERT INTO experiences(tenant,data) VALUES('nord-atelier',$1)")
        .bind(json!({"mode":"balanced","headline":"A considered wardrobe. Made for everyday."}))
        .execute(&mut *tx)
        .await?;
    for variant in ["discovery", "comparison"] {
        sqlx::query("INSERT INTO policy(tenant,variant) VALUES('nord-atelier',$1)")
            .bind(variant)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    for p in prototype_products(a, "nord-atelier").await? {
        knowledge::sync_product_scoped(&a.db, "nord-atelier", &json!(p)).await?;
    }
    knowledge::seed_relations(&a.db, "nord-atelier").await?;
    Ok(())
}

pub(crate) async fn categories(tx: &mut sqlx::PgConnection, tenant: &str) -> Result<()> {
    for category in template()["categories"].as_array().unwrap() {
        sqlx::query("UPDATE categories SET data=jsonb_set(data,'{translations}',$3) WHERE tenant=$1 AND id='legacy-'||md5($2)")
            .bind(tenant).bind(category["id"].as_str()).bind(&category["translations"]).execute(&mut *tx).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fashion_template_has_complete_localized_products_and_real_asset_files() {
        let data = template();
        let products = data["products"].as_array().unwrap();
        let roots: Vec<_> = products
            .iter()
            .filter(|p| p["parent_id"].is_null())
            .collect();
        assert_eq!(roots.len(), 12);
        let ids: std::collections::HashSet<_> =
            products.iter().map(|p| p["id"].as_str().unwrap()).collect();
        assert_eq!(ids.len(), products.len());
        for p in products {
            assert!(p["price"].as_f64().unwrap() > 0.);
            if let Some(parent) = p["parent_id"].as_str() {
                assert!(roots.iter().any(|r| r["id"] == parent));
            }
            for media in p["media"].as_array().unwrap() {
                let url = media["url"].as_str().unwrap();
                assert!(url.starts_with("/media/demo/fashion/") && url.ends_with(".webp"));
                let bytes = std::fs::read(format!("frontend/public{url}")).unwrap();
                assert_eq!(&bytes[..4], b"RIFF");
                assert_eq!(&bytes[8..12], b"WEBP");
            }
            for language in [
                "2fbb5fe2e29a4d70aa5854ce7ce3e20b",
                "11111111111111111111111111111111",
                "22222222222222222222222222222222",
                "33333333333333333333333333333333",
            ] {
                assert!(
                    data["translations"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|tr| tr["product_id"] == p["id"]
                            && tr["language_id"] == language
                            && !tr["name"].as_str().unwrap().is_empty())
                );
            }
        }
    }
}
