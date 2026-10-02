//! Merchant authorization and review publication.
use super::*;

pub(crate) async fn moderate(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let approved = v["approved"]
        .as_bool()
        .ok_or(bad("approved boolean required"))?;
    let count = sqlx::query("UPDATE product_reviews SET approved=$1 WHERE tenant=$2 AND id=$3")
        .bind(approved)
        .bind(t)
        .bind(id)
        .execute(&a.db)
        .await?
        .rows_affected();
    if count == 0 {
        return Err(Error(StatusCode::NOT_FOUND, "Review not found".into()));
    }
    Ok(Json(json!({"approved":approved})))
}
