//! Rebuild a product edit from an audited snapshot; stock stays current and all associations/media pass normal admission.
use super::*;
pub(super) async fn restore(
    a: App,
    h: RequestContext,
    id: String,
    state: Value,
    revision: i64,
) -> Result<Json<Value>> {
    let Json(mut current) =
        commerce::product_editor(State(a.clone()), h.clone(), Path(id.clone())).await?;
    if current["revision"] != revision {
        return Err(conflict("Product changed; reload before restoring"));
    }
    let r = &state["record"];
    let stock = current["commerce"]["stock"].clone();
    for (key, column) in [
        ("price", "price"),
        ("taxRate", "tax_rate"),
        ("minPurchase", "min_purchase"),
        ("purchaseSteps", "purchase_steps"),
        ("maxPurchase", "max_purchase"),
        ("deliveryDays", "delivery_days"),
        ("listPrice", "list_price"),
        ("regulationPrice", "regulation_price"),
        ("referencePrice", "reference_price"),
        ("advancedPrices", "advanced_prices"),
        ("media", "media"),
        ("properties", "properties"),
    ] {
        current["commerce"][key] = r[column].clone();
    }
    current["commerce"]["stock"] = stock;
    current["extra"] = r["extra"].clone();
    let t = merchant(&a, &h)?;
    let (settings, _) = commerce::config(&a, &t).await?;
    let mut tr = json!({});
    for locale in &settings.locales {
        let base = locale.split('-').next().unwrap();
        let key = if settings
            .locales
            .iter()
            .filter(|l| l.split('-').next() == Some(base))
            .count()
            == 1
        {
            base
        } else {
            locale
        };
        tr[key] = state["translations"][locale].clone();
        if tr[key].is_null() {
            tr[key] = json!({"name":null,"description":null});
        }
        if locale == &settings.main_locale && tr[key]["name"].is_null() {
            tr[key] = json!({"name":r["name"],"description":r["description"]});
        }
    }
    current["translations"] = tr;
    current["catalog"] = json!({"active":r["active"],"productNumber":r["product_number"].as_str().unwrap_or(&id),"parentId":r["parent_id"],"options":r["options"],"categoryIds":state["categories"],"salesChannelIds":current["channels"].as_array().unwrap().iter().filter(|channel|state["channels"].as_array().is_none_or(|old|!old.iter().any(|v|v["id"]==channel["id"]&&v["visible"]==false))).map(|c|c["id"].clone()).collect::<Vec<_>>()});
    commerce::edit_product(State(a), h, Path(id), Json(current)).await
}
