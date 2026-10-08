//! Tenant configuration and operational read model.
use super::*;

pub(crate) async fn merchant_config(
    State(a): State<App>,
    h: RequestContext,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "settings.read")?;
    let (data, revision) = config(&a, &t).await?;
    let rs=sqlx::query("SELECT id,product_id,author,rating,title,content,verified,approved,demo FROM product_reviews WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(&t).fetch_all(&a.db).await?;
    let os = if auth::permit(&h, "orders.read").is_ok() {
        sqlx::query("SELECT data #- '{cart,token}' AS data FROM orders WHERE tenant=$1 ORDER BY created_at DESC LIMIT 30")
            .bind(&t)
            .fetch_all(&a.db)
            .await?
    } else {
        Vec::new()
    };
    Ok(Json(
        json!({"data":data,"revision":revision,"reviews":rs.iter().map(|r|json!({"id":r.get::<String,_>("id"),"productId":r.get::<String,_>("product_id"),"author":r.get::<String,_>("author"),"rating":r.get::<i32,_>("rating"),"title":r.get::<String,_>("title"),"content":r.get::<String,_>("content"),"approved":r.get::<bool,_>("approved"),"verifiedPurchase":r.get::<bool,_>("verified"),"demo":r.get::<bool,_>("demo")})).collect::<Vec<_>>(),"orders":os.iter().map(|r|r.get::<Value,_>("data")).collect::<Vec<_>>()}),
    ))
}
