//! Central product list and identity/association writes; all persistence is tenant scoped.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CatalogFields {
    pub active: bool,
    pub product_number: String,
    pub category_ids: Vec<String>,
    #[serde(default)]
    pub sales_channel_ids: Option<Vec<String>>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub options: HashMap<String, String>,
}
impl CatalogFields {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.product_number.trim().is_empty()
            || self.product_number.len() > 100
            || self.category_ids.len() > 100
            || self.options.len() > 40
            || self
                .options
                .iter()
                .any(|(k, v)| k.is_empty() || k.len() > 100 || v.is_empty() || v.len() > 200)
        {
            return Err(bad("Invalid product identity or options"));
        }
        Ok(())
    }
    pub(crate) async fn save(&self, tx: &mut sqlx::PgConnection, t: &str, id: &str) -> Result<()> {
        let duplicate:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND product_number=$2 AND id<>$3)").bind(t).bind(&self.product_number).bind(id).fetch_one(&mut *tx).await?;
        if duplicate {
            return Err(conflict("Product number already exists"));
        }
        sqlx::query(
            "UPDATE products SET active=$1,product_number=$2,options=$3 WHERE tenant=$4 AND id=$5",
        )
        .bind(self.active)
        .bind(&self.product_number)
        .bind(json!(self.options))
        .bind(t)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        if let Some(ids) = &self.sales_channel_ids {
            save_product_channels(tx, t, id, ids).await?;
        }
        categories::assignments(tx, t, id, &self.category_ids).await
    }
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ProductCriteria {
    search: Option<String>,
    after: Option<String>,
    limit: Option<i64>,
    active: Option<bool>,
    category_id: Option<String>,
    parent_id: Option<String>,
    low_stock: Option<bool>,
}
pub(crate) fn product_admin_router() -> Router<App> {
    Router::new().route(
        "/api/merchant/products",
        get(list_products).post(super::create_product),
    )
}
pub(crate) async fn list_products(
    State(a): State<App>,
    h: HeaderMap,
    axum::extract::Query(c): axum::extract::Query<ProductCriteria>,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog.read")?;
    let t = merchant(&a, &h)?;
    let limit = c.limit.unwrap_or(25);
    if !(1..=100).contains(&limit)
        || c.search.as_ref().is_some_and(|s| s.len() > 200)
        || c.after.as_ref().is_some_and(|s| s.len() > 100)
    {
        return Err(bad("Invalid product filters"));
    }
    let pattern = c.search.map(|s| {
        format!(
            "%{}%",
            s.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        )
    });
    let rows = sqlx::query(include_str!("product_admin.sql"))
        .bind(&t)
        .bind(c.after.unwrap_or_default())
        .bind(c.active)
        .bind(pattern)
        .bind(c.category_id)
        .bind(c.parent_id)
        .bind(c.low_stock.unwrap_or(false))
        .bind(limit + 1)
        .fetch_all(&a.db)
        .await?;
    let (_, chain) = language_context(&a, &h).await?;
    let translated = localize_products(
        &a,
        &t,
        &chain,
        rows.iter().take(limit as usize).map(product).collect(),
    )
    .await?;
    let has_more = rows.len() > limit as usize;
    let mut elements = vec![];
    for (r, p) in rows.iter().take(limit as usize).zip(translated.iter()) {
        let mut v = json!(p);
        v["active"] = json!(r.get::<bool, _>("active"));
        v["productNumber"] = json!(r.get::<Option<String>, _>("product_number"));
        v["variantCount"] = json!(r.get::<i64, _>("variant_count"));
        v["categoryIds"] = json!(r.get::<Vec<String>, _>("category_ids"));
        elements.push(v);
    }
    let cursor = has_more.then(|| elements.last().unwrap()["id"].clone());
    Ok(Json(
        json!({"elements":elements,"hasMore":has_more,"nextCursor":cursor,"limit":limit}),
    ))
}
