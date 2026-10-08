//! Store API cart and order route adapters.
use crate::*;

pub(crate) async fn create_cart(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let c = new_cart_context(&a, &h, v["session"].as_str().unwrap_or(""), "storefront").await?;
    Ok(Json(cart_json(&a, &c).await?))
}
pub(crate) async fn get_cart(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let c = if header(&h, "sw-context-token").is_some() {
        load_cart(&a, &h).await?
    } else {
        new_cart_context(&a, &h, "", "storefront").await?
    };
    Ok(Json(cart_json(&a, &c).await?))
}
pub(crate) async fn edit_cart(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let items: Vec<Item> =
        serde_json::from_value(v["items"].clone()).map_err(|e| bad(e.to_string()))?;
    let c = set_items(&a, &h, items, v["revision"].as_i64()).await?;
    Ok(Json(cart_json(&a, &c).await?))
}
pub(crate) async fn add_items(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let mut items = c.data.items;
    for row in v["items"].as_array().ok_or(bad("items array required"))? {
        let id = row["referencedId"]
            .as_str()
            .or(row["id"].as_str())
            .ok_or(bad("referencedId required"))?;
        let qty = row["quantity"].as_u64().unwrap_or(1);
        if qty > 10000 {
            return Err(bad("Quantity too large"));
        }
        if let Some(i) = items.iter_mut().find(|i| i.id == id) {
            i.quantity = i
                .quantity
                .checked_add(qty as u32)
                .ok_or(bad("Quantity overflow"))?;
        } else {
            items.push(Item {
                id: id.into(),
                quantity: qty as u32,
            });
        }
    }
    let changed = set_items(&a, &h, items, Some(c.revision)).await?;
    Ok(Json(cart_json(&a, &changed).await?))
}
pub(crate) async fn place_order(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    Ok(Json(
        checkout(
            &a,
            &h,
            header(&h, "idempotency-key").ok_or(bad("Idempotency-Key required"))?,
        )
        .await?,
    ))
}
