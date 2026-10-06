//! Customer-owned order reads and receipts share one tenant/identity predicate and a public projection.
use super::*;

// An account ID snapshot owns modern orders; matching guest email never grants access.
async fn owned(
    a: &App,
    t: &str,
    email: &str,
    id: Option<&str>,
    after: Option<&str>,
) -> Result<Vec<Value>> {
    let rows = sqlx::query("SELECT o.data, o.created_at::text AS time FROM orders o JOIN carts c ON c.id=o.cart_id AND c.tenant=o.tenant WHERE o.tenant=$1 AND ($3::text IS NULL OR o.id=$3) AND ((o.data->'orderCustomer'->>'customerId')=(SELECT id FROM customers WHERE tenant=o.tenant AND email=$2) OR (NOT o.data ? 'orderCustomer' AND c.data->>'email'=$2)) AND ($4::text IS NULL OR (o.created_at,o.id)<(SELECT created_at,id FROM orders WHERE tenant=$1 AND id=$4)) ORDER BY o.created_at DESC,o.id DESC LIMIT 101")
        .bind(t).bind(email).bind(id).bind(after).fetch_all(&a.db).await?;
    Ok(rows
        .iter()
        .map(|r| project(&r.get("data"), &r.get::<String, _>("time")))
        .collect())
}
fn project(raw: &Value, created: &str) -> Value {
    let mut v = json!({});
    for key in [
        "id",
        "orderNumber",
        "revision",
        "state",
        "orderDateTime",
        "billingAddress",
        "shippingAddress",
        "billingAddressId",
        "shippingAddressId",
        "deliveries",
    ] {
        v[key] = raw[key].clone();
    }
    v["cart"] = json!({"id":raw["cart"]["id"], "price":raw["cart"]["price"], "shippingCosts":raw["cart"]["shippingCosts"], "lineItems":raw["cart"]["lineItems"]});
    v["payment"] = json!({"state":raw["payment"]["state"], "provider":raw["payment"]["provider"], "method":raw["payment"]["method"]});
    v["createdAt"] = json!(created);
    commerce::order_fields(&mut v);
    v
}
#[derive(Default, Deserialize)]
pub(super) struct Page {
    after: Option<String>,
}
pub(super) async fn list(
    State(a): State<App>,
    h: HeaderMap,
    axum::extract::Query(page): axum::extract::Query<Page>,
) -> Result<Json<Value>> {
    let (t, email) = identity(&a, &h).await?;
    if let Some(after) = &page.after
        && (after.len() > 128 || owned(&a, &t, &email, Some(after), None).await?.is_empty())
    {
        return Err(Error(StatusCode::NOT_FOUND, "Order not found".into()));
    }
    let mut elements = owned(&a, &t, &email, None, page.after.as_deref()).await?;
    let has_more = elements.len() > 100;
    elements.truncate(100);
    let next = if has_more {
        elements.last().map(|v| v["id"].clone())
    } else {
        None
    };
    let (machine, _) = commerce::machine(&a.db, &t).await?;
    let labels = json!(
        machine
            .states
            .iter()
            .map(|s| (&s.id, &s.label))
            .collect::<HashMap<_, _>>()
    );
    for v in &mut elements {
        v["stateLabels"] = labels.clone();
    }
    Ok(Json(json!({"elements":elements,"nextCursor":next})))
}
pub(super) async fn detail(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let (t, email) = identity(&a, &h).await?;
    let mut v = owned(&a, &t, &email, Some(&id), None)
        .await?
        .pop()
        .ok_or(Error(StatusCode::NOT_FOUND, "Order not found".into()))?;
    let rows = sqlx::query("SELECT id,kind,number,locale,created_at::text AS created FROM order_receipts WHERE tenant=$1 AND order_id=$2 ORDER BY created_at DESC LIMIT 100")
        .bind(&t).bind(&id).fetch_all(&a.db).await?;
    v["receipts"] = json!(rows.iter().map(|r| json!({"id":r.get::<String,_>("id"), "kind":r.get::<String,_>("kind"), "number":r.get::<String,_>("number"), "locale":r.get::<String,_>("locale"), "createdAt":r.get::<String,_>("created"), "pdfPath":format!("/store-api/account/orders/{id}/receipts/{}/pdf", r.get::<String,_>("id"))})).collect::<Vec<_>>());
    let (machine, _) = commerce::machine(&a.db, &t).await?;
    v["stateLabels"] = json!(
        machine
            .states
            .iter()
            .map(|s| (&s.id, &s.label))
            .collect::<HashMap<_, _>>()
    );
    Ok(Json(v))
}
pub(super) async fn receipt(
    State(a): State<App>,
    h: HeaderMap,
    Path((order, id)): Path<(String, String)>,
) -> Result<Response> {
    let (t, email) = identity(&a, &h).await?;
    if owned(&a, &t, &email, Some(&order), None).await?.is_empty() {
        return Err(Error(StatusCode::NOT_FOUND, "Order not found".into()));
    }
    let snapshot: Value = sqlx::query_scalar(
        "SELECT snapshot FROM order_receipts WHERE tenant=$1 AND order_id=$2 AND id=$3",
    )
    .bind(t)
    .bind(order)
    .bind(id)
    .fetch_optional(&a.db)
    .await?
    .ok_or(Error(StatusCode::NOT_FOUND, "Receipt not found".into()))?;
    Ok(crate::operations::receipt_response(&snapshot))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projection_does_not_leak_operational_or_session_data() {
        let raw = json!({"id":"own", "automation":{"notes":["Internal"]}, "activity":[{"actor":"private"}], "cart":{"token":"secret", "checkout":{"customerToken":"secret"}, "price":{"totalPrice":12}}, "payment":{"state":"paid","provider":"manual","attemptId":"private"}});
        let v = project(&raw, "2026-10-06");
        assert_eq!(v["id"], "own");
        assert_eq!(v["amountTotal"], 12);
        assert!(v.get("automation").is_none());
        assert!(v.get("activity").is_none());
        assert!(v["cart"].get("token").is_none());
        assert!(v["cart"].get("checkout").is_none());
        assert!(v["payment"].get("attemptId").is_none());
    }
}
