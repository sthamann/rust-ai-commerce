//! Merchant order read adapter.
use crate::*;

pub(crate) async fn orders(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rs =
        sqlx::query("SELECT data FROM orders WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100")
            .bind(t)
            .fetch_all(&a.db)
            .await?;
    Ok(Json(
        json!({"data":rs.iter().map(|r|r.get::<Value,_>("data")).collect::<Vec<_>>()}),
    ))
}
