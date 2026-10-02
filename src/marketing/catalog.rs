//! Native condition metadata, app action/event discovery and source-compatible condition import.
use super::*;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/api/automation/catalog", get(catalog))
        .route("/api/automation/import-condition", post(import))
}
async fn catalog(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rows =
        sqlx::query("SELECT id,manifest FROM app_packages WHERE tenant=$1 AND active ORDER BY id")
            .bind(t)
            .fetch_all(&a.db)
            .await?;
    Ok(Json(
        json!({"upstream":"shopware/core 6.7.14.2","conditions":["andContainer","orContainer","notContainer","alwaysValid","cartCartAmount","cartLineItemCount","customerGroup","shippingCountry","salesChannel","lineItemId","customerLoggedIn","orderState","paymentState","deliveryState","contextField","eventField","shippingMethod","paymentMethod","customerEmail","customerBillingCountry","customerShippingCountry","cartLineItem"],"fields":rule_fields::FIELDS,"events":["order.placed","order.state_changed","payment.captured","payment.state_changed","delivery.state_changed","payment.updated"],"apps":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"manifest":r.get::<Value,_>("manifest")})).collect::<Vec<_>>(),"completeUpstreamConditionCatalog":false}),
    ))
}
async fn import(h: HeaderMap, Json(v): Json<Value>) -> Result<Json<Value>> {
    auth::permit(&h, "settings.write")?;
    let normalized = normalize(&v, 0)?;
    let c: rules::Condition = serde_json::from_value(normalized.clone())
        .map_err(|_| bad("Unsupported Shopware condition"))?;
    c.validate(0)?;
    Ok(Json(json!({"condition":normalized,"saved":false})))
}
fn normalize(v: &Value, depth: usize) -> Result<Value> {
    if depth > 8 {
        return Err(bad("Maximum rule depth 8"));
    }
    let typ = v["type"].as_str().ok_or(bad("Condition type required"))?;
    if ["andContainer", "orContainer"].contains(&typ) {
        let children = v["children"]
            .as_array()
            .filter(|c| c.len() <= 20)
            .ok_or(bad("Container children required"))?;
        return Ok(
            json!({"type":typ,"children":children.iter().map(|c|normalize(c,depth+1)).collect::<Result<Vec<_>>>()?}),
        );
    }
    if typ == "notContainer" {
        let child = v
            .get("child")
            .or_else(|| {
                v["children"]
                    .as_array()
                    .filter(|c| c.len() == 1)
                    .and_then(|c| c.first())
            })
            .ok_or(bad("NOT requires one child"))?;
        return Ok(json!({"type":typ,"child":normalize(child,depth+1)?}));
    }
    let mut result = if v["value"].is_object() {
        v["value"].clone()
    } else {
        let mut copy = v.clone();
        for k in ["id", "parentId", "ruleId", "position", "children"] {
            copy.as_object_mut()
                .ok_or(bad("Condition object required"))?
                .remove(k);
        }
        copy
    };
    let alias = match typ {
        "customerGroup" | "customerCustomerGroup" => Some("customerGroupIds"),
        "shippingCountry" | "customerBillingCountry" | "customerShippingCountry" => {
            Some("countryIds")
        }
        "shippingMethod" => Some("shippingMethodIds"),
        "paymentMethod" => Some("paymentMethodIds"),
        "salesChannel" => Some("salesChannelIds"),
        "lineItemId" | "cartLineItem" => Some("identifiers"),
        _ => None,
    };
    if let Some(key) = alias
        && let Some(value) = result.as_object_mut().and_then(|v| v.remove(key))
    {
        result["values"] = value;
    }
    result["type"] = json!(typ);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_condition_import_preserves_negative_sets_and_rejects_unsupported() {
        let c=normalize(&json!({"type":"customerGroup","value":{"customerGroupIds":["consumer"],"operator":"!="},"id":"ignored"}),0).unwrap();
        assert_eq!(
            c,
            json!({"type":"customerGroup","values":["consumer"],"operator":"!="})
        );
        assert!(normalize(&json!({"type":"notContainer","children":[]}), 0).is_err());
        assert!(normalize(&json!({"type":"notContainer","children":[{"type":"alwaysValid"},{"type":"alwaysValid"}]}),0).is_err());
    }
}
