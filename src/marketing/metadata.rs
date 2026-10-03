//! Authorized revision-bound source facts for products, customers and orders; secrets and pricing authority are excluded.
use super::*;
pub(crate) fn validate_metadata(entity: &str, data: &Value) -> Result<()> {
    if data.is_null() {
        return Ok(());
    }
    let object = data
        .as_object()
        .filter(|o| o.len() <= 40)
        .ok_or(bad("Rule metadata object required"))?;
    if data.to_string().len() > 16000 {
        return Err(bad("Rule metadata exceeds limit"));
    }
    let keys = match entity {
        "products" => &[
            "height",
            "width",
            "length",
            "weight",
            "volume",
            "closeout",
            "markAsTopseller",
            "isNew",
            "tags",
            "streamIds",
            "manufacturerId",
            "customFields",
            "categoryIds",
            "taxId",
            "propertyIds",
            "optionIds",
            "purchasePrices",
            "releaseDate",
            "createdAt",
        ][..],
        "customers" => &[
            "tags",
            "customFields",
            "affiliateCode",
            "campaignCode",
            "requestedGroupId",
            "newsletter",
            "createdByAdmin",
        ][..],
        "orders" => &[
            "tags",
            "customFields",
            "affiliateCode",
            "campaignCode",
            "createdByAdmin",
        ][..],
        _ => return Err(bad("Unknown rule entity")),
    };
    for (key, value) in object {
        if !keys.contains(&key.as_str()) {
            return Err(bad(format!("Unsupported rule metadata field: {key}")));
        }
        if ["height", "width", "length", "weight", "volume"].contains(&key.as_str())
            && value.as_f64().is_none_or(|n| !n.is_finite() || n < 0.)
        {
            return Err(bad("Dimension must be nonnegative"));
        }
        if [
            "closeout",
            "markAsTopseller",
            "isNew",
            "newsletter",
            "createdByAdmin",
        ]
        .contains(&key.as_str())
            && !value.is_boolean()
        {
            return Err(bad("Boolean rule metadata required"));
        }
        if [
            "tags",
            "streamIds",
            "categoryIds",
            "propertyIds",
            "optionIds",
        ]
        .contains(&key.as_str())
            && value.as_array().is_none_or(|a| {
                a.len() > 100
                    || a.iter()
                        .any(|s| s.as_str().is_none_or(|s| s.is_empty() || s.len() > 100))
            })
        {
            return Err(bad("Bounded identifier list required"));
        }
        if key == "customFields" && !value.is_object() {
            return Err(bad("Custom field object required"));
        }
        if key == "purchasePrices"
            && !value.is_null()
            && (!value.is_object()
                || value.as_object().unwrap().iter().any(|(k, v)| {
                    !["net", "gross"].contains(&k.as_str())
                        || v.as_f64().is_none_or(|n| !n.is_finite() || n < 0.)
                }))
        {
            return Err(bad("Nonnegative net/gross purchase prices required"));
        }
    }
    Ok(())
}
pub(crate) fn router() -> Router<App> {
    Router::new().route(
        "/api/automation/entities/{entity}/{id}",
        axum::routing::put(save),
    )
}
async fn save(
    State(a): State<App>,
    h: HeaderMap,
    Path((entity, id)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(
        &h,
        match entity.as_str() {
            "products" => "catalog.write",
            "customers" => "customers.write",
            "orders" => "orders.write",
            _ => return Err(bad("Unknown rule entity")),
        },
    )?;
    validate_metadata(&entity, &v["data"])?;
    let rev = v["revision"].as_i64().ok_or(bad("Revision required"))?;
    let n=match entity.as_str(){
        "products"=>sqlx::query("UPDATE products SET extra=jsonb_set(extra,'{automation}',$1),revision=revision+1 WHERE tenant=$2 AND id=$3 AND revision=$4").bind(&v["data"]).bind(&t).bind(&id).bind(rev).execute(&a.db).await?.rows_affected(),
        "customers"=>sqlx::query("UPDATE customers SET automation=$1,revision=revision+1 WHERE tenant=$2 AND id=$3 AND revision=$4").bind(&v["data"]).bind(&t).bind(&id).bind(rev).execute(&a.db).await?.rows_affected(),
        _=>sqlx::query("UPDATE orders SET data=jsonb_set(jsonb_set(data,'{automation}',$1),'{revision}',to_jsonb($4::bigint+1)) WHERE tenant=$2 AND id=$3 AND (data->>'revision')::bigint=$4").bind(&v["data"]).bind(&t).bind(&id).bind(rev).execute(&a.db).await?.rows_affected(),
    };
    if n != 1 {
        return Err(conflict("Rule entity revision changed"));
    }
    Ok(Json(json!({"saved":true,"revision":rev+1})))
}
