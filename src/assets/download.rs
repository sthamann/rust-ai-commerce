//! Public attachments honor sales-channel visibility; downloads require a paid, owned order snapshot.
use super::*;
pub(super) async fn attachments(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    marketing::admit_product(&a, &h, &id).await?;
    let t = tenant(&h)?;
    let rows=sqlx::query("SELECT id,title,filename,mime,octet_length(content) AS bytes FROM product_assets WHERE tenant=$1 AND public AND kind='attachment' AND (product_id=$2 OR product_id=(SELECT parent_id FROM products WHERE tenant=$1 AND id=$2)) ORDER BY created_at LIMIT 50").bind(t).bind(id).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"title":r.get::<Value,_>("title"),"filename":r.get::<String,_>("filename"),"mime":r.get::<String,_>("mime"),"bytes":r.get::<i32,_>("bytes")})).collect::<Vec<_>>()}),
    ))
}
fn response(r: &sqlx::postgres::PgRow) -> Response {
    let filename: String = r.get("filename");
    (
        [
            (axum::http::header::CONTENT_TYPE, r.get::<String, _>("mime")),
            (
                axum::http::header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
            (
                axum::http::header::CACHE_CONTROL,
                "private, no-store".into(),
            ),
            (axum::http::header::X_CONTENT_TYPE_OPTIONS, "nosniff".into()),
        ],
        r.get::<Vec<u8>, _>("content"),
    )
        .into_response()
}
pub(super) async fn attachment(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response> {
    let t = tenant(&h)?;
    let r=sqlx::query("SELECT product_id,mime,filename,content FROM product_assets WHERE tenant=$1 AND id=$2 AND kind='attachment' AND public").bind(t).bind(id).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Attachment not found".into()))?;
    marketing::admit_product(&a, &h, &r.get::<String, _>("product_id")).await?;
    Ok(response(&r))
}
fn paid(o: &Value) -> bool {
    !["cancelled", "expired", "payment_review"].contains(&o["state"].as_str().unwrap_or(""))
        && (["paid", "captured", "partially_refunded"]
            .contains(&o["payment"]["state"].as_str().unwrap_or(""))
            || o["payment"]["provider"] == "simulated" && o["payment"]["state"] == "authorized")
}
pub(super) async fn owned(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (t, email) = accounts::identity(&a, &h).await?;
    let rows=sqlx::query("SELECT a.id,a.title,a.filename,o.id AS order_id,o.data FROM order_downloads d JOIN product_assets a ON a.tenant=d.tenant AND a.id=d.asset_id JOIN orders o ON o.tenant=d.tenant AND o.id=d.order_id JOIN carts c ON c.id=o.cart_id WHERE d.tenant=$1 AND ((o.data->'orderCustomer'->>'customerId')=(SELECT id FROM customers WHERE tenant=o.tenant AND email=$2) OR (NOT o.data ? 'orderCustomer' AND c.data->>'email'=$2)) ORDER BY o.created_at DESC LIMIT 200").bind(t).bind(email).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().filter(|r|paid(&r.get::<Value,_>("data"))).map(|r|json!({"id":r.get::<String,_>("id"),"title":r.get::<Value,_>("title"),"filename":r.get::<String,_>("filename"),"orderId":r.get::<String,_>("order_id")})).collect::<Vec<_>>()}),
    ))
}
pub(super) async fn file(
    State(a): State<App>,
    h: HeaderMap,
    Path((order, asset)): Path<(String, String)>,
) -> Result<Response> {
    let t = tenant(&h)?;
    let email = if header(&h, "x-customer-token").is_some() {
        Some(accounts::identity(&a, &h).await?.1)
    } else {
        None
    };
    let token = header(&h, "sw-context-token").unwrap_or("");
    let r=sqlx::query("SELECT a.mime,a.filename,a.content,o.data FROM order_downloads d JOIN product_assets a ON a.tenant=d.tenant AND a.id=d.asset_id JOIN orders o ON o.tenant=d.tenant AND o.id=d.order_id JOIN carts c ON c.id=o.cart_id WHERE d.tenant=$1 AND d.order_id=$2 AND d.asset_id=$3 AND (($4::text IS NOT NULL AND ((o.data->'orderCustomer'->>'customerId')=(SELECT id FROM customers WHERE tenant=o.tenant AND email=$4) OR (NOT o.data ? 'orderCustomer' AND c.data->>'email'=$4))) OR (length($5)>0 AND c.token=$5))").bind(t).bind(order).bind(asset).bind(email).bind(token).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Download not found".into()))?;
    if !paid(&r.get::<Value, _>("data")) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Download requires a confirmed payment".into(),
        ));
    }
    Ok(response(&r))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn payment_gate() {
        assert!(paid(
            &json!({"state":"placed","payment":{"provider":"simulated","state":"authorized"}})
        ));
        assert!(!paid(
            &json!({"state":"cancelled","payment":{"state":"captured"}})
        ));
        assert!(!paid(
            &json!({"state":"placed","payment":{"provider":"paypal","state":"approved"}})
        ));
    }
}
