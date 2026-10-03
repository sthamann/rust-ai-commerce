//! Rule line facts use immutable priced lines plus current tenant product metadata; protected values override metadata.
use super::*;
pub(super) fn line(p: &Product, item: &Value) -> Value {
    let a = &p.extra["automation"];
    let mut v = if a.is_object() { a.clone() } else { json!({}) };
    for (key, default) in [
        ("height", json!(0)),
        ("width", json!(0)),
        ("length", json!(0)),
        ("weight", json!(0)),
        ("volume", json!(0)),
        ("closeout", json!(false)),
        ("isNew", json!(false)),
        ("tags", json!([])),
        ("streamIds", json!([])),
        ("manufacturerId", Value::Null),
        ("customFields", json!({})),
        ("purchasePrices", Value::Null),
        ("createdAt", Value::Null),
        ("releaseDate", Value::Null),
    ] {
        if v.get(key).is_none() {
            v[key] = default
        }
    }
    v["id"] = json!(p.id);
    v["referencedId"] = json!(p.id);
    v["parentId"] = json!(p.parent_id);
    v["quantity"] = item["quantity"].clone();
    v["type"] = json!("product");
    v["good"] = json!(true);
    v["stock"] = json!(p.stock);
    v["availableStock"] = json!(p.stock);
    v["unitPrice"] = item["price"]["unitPrice"].clone();
    v["totalPrice"] = item["price"]["totalPrice"].clone();
    v["listPrice"] = item["price"]["listPrice"]["price"].clone();
    v["listPriceRatio"] = json!(
        item["price"]["listPrice"]["percentage"]
            .as_f64()
            .map(|p| (100. - p) / 100.)
            .unwrap_or(0.)
    );
    v["shippingFree"] = json!(p.extra["shippingFree"] == true);
    v["promoted"] = json!(a["markAsTopseller"].as_bool().unwrap_or(false));
    v["categoryIds"] = a.get("categoryIds").cloned().unwrap_or(json!([p.category]));
    v["taxId"] = a
        .get("taxId")
        .cloned()
        .unwrap_or(json!(p.tax_rate.to_string()));
    v["optionIds"] = a.get("optionIds").cloned().unwrap_or(json!(
        p.options
            .as_object()
            .into_iter()
            .flat_map(|o| o.values())
            .cloned()
            .collect::<Vec<_>>()
    ));
    v["propertyIds"] = a.get("propertyIds").cloned().unwrap_or(json!(
        p.properties
            .as_object()
            .into_iter()
            .flat_map(|o| o.values())
            .cloned()
            .collect::<Vec<_>>()
    ));
    v["propertyAndOptionIds"] = json!(
        v["propertyIds"]
            .as_array()
            .into_iter()
            .flatten()
            .chain(v["optionIds"].as_array().into_iter().flatten())
            .cloned()
            .collect::<Vec<_>>()
    );
    v["volume"] = json!(
        v["width"].as_f64().unwrap_or(0.)
            * v["height"].as_f64().unwrap_or(0.)
            * v["length"].as_f64().unwrap_or(0.)
            / 1_000_000_000.
    );
    v["states"] = json!([if p.extra["digital"] == true {
        "is-download"
    } else {
        "is-physical"
    }]);
    v["productType"] = json!(if p.extra["digital"] == true {
        "digital"
    } else {
        "physical"
    });
    v
}
