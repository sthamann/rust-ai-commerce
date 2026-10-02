//! Customer review submission with server-derived purchase verification.
use super::*;

pub(crate) async fn submit_review(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let rating = v["rating"]
        .as_i64()
        .filter(|v| (1..=5).contains(v))
        .ok_or(bad("Rating must be 1..5"))?;
    let text = |key: &str, max: usize| -> Result<String> {
        let s = v[key].as_str().unwrap_or("").trim();
        if s.is_empty() || s.chars().count() > max {
            return Err(bad(format!("Invalid {key}")));
        }
        Ok(s.into())
    };
    let author = text("author", 80)?;
    let title = text("title", 120)?;
    let content = text("content", 3000)?;
    if sqlx::query("SELECT 1 FROM products WHERE tenant=$1 AND id=$2")
        .bind(&c.tenant)
        .bind(&id)
        .fetch_optional(&a.db)
        .await?
        .is_none()
    {
        return Err(bad("Unknown product"));
    }
    let verified:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM orders o JOIN carts c ON c.id=o.cart_id WHERE o.tenant=$1 AND (o.cart_id=$2 OR ($3::text IS NOT NULL AND c.data->>'email'=$3)) AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.data->'cart'->'lineItems') i WHERE i->>'id'=$4))").bind(&c.tenant).bind(&c.id).bind(&c.data.email).bind(&id).fetch_one(&a.db).await?;
    let review_id = uid();
    let changed=sqlx::query("INSERT INTO product_reviews(id,tenant,product_id,session,author,rating,title,content,verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(tenant,product_id,session) DO NOTHING").bind(&review_id).bind(&c.tenant).bind(&id).bind(c.data.email.as_deref().unwrap_or(&c.id)).bind(author).bind(rating as i32).bind(title).bind(content).bind(verified).execute(&a.db).await?;
    if changed.rows_affected() == 0 {
        return Err(conflict("One review per product and customer context"));
    }
    Ok(Json(
        json!({"id":review_id,"state":"pending-moderation","verifiedPurchase":verified}),
    ))
}
