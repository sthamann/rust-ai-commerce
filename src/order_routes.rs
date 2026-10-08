//! Merchant order read adapter.
use crate::*;

pub(crate) async fn orders(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "orders.read")?;
    let rs =
        sqlx::query("SELECT data #- '{cart,token}' AS data FROM orders WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100")
            .bind(t)
            .fetch_all(&a.db)
            .await?;
    Ok(Json(
        json!({"data":rs.iter().map(|r|{let mut v:Value=r.get("data");commerce::order_fields(&mut v);v}).collect::<Vec<_>>()}),
    ))
}
