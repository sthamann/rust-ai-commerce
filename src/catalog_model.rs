//! Tenant product model and database hydration.
use crate::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Product {
    #[serde(default)]
    pub(crate) extra: Value,
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) category: String,
    pub(crate) description: String,
    pub(crate) price: f64,
    pub(crate) tax_rate: f64,
    pub(crate) stock: i32,
    pub(crate) revision: i64,
    pub(crate) list_price: Option<f64>,
    pub(crate) regulation_price: Option<f64>,
    pub(crate) reference_price: Option<rust_ai_commerce::pricing::ReferenceDefinition>,
    pub(crate) advanced_prices: Vec<rust_ai_commerce::context::Tier>,
    pub(crate) min_purchase: u32,
    pub(crate) purchase_steps: u32,
    pub(crate) max_purchase: Option<u32>,
    pub(crate) parent_id: Option<String>,
    pub(crate) options: Value,
    pub(crate) media: Value,
    pub(crate) properties: Value,
    pub(crate) delivery_days: i32,
}
pub(crate) fn product(r: &sqlx::postgres::PgRow) -> Product {
    Product {
        extra: r.get("extra"),
        parent_id: r.get("parent_id"),
        options: r.get("options"),
        media: r.get("media"),
        properties: r.get("properties"),
        delivery_days: r.get("delivery_days"),
        id: r.get("id"),
        name: r.get("name"),
        category: r.get("category"),
        description: r.get("description"),
        price: r.get("price"),
        tax_rate: r.get("tax_rate"),
        stock: r.get("stock"),
        revision: r.get("revision"),
        list_price: r.get("list_price"),
        regulation_price: r.get("regulation_price"),
        advanced_prices: serde_json::from_value(r.get::<Value, _>("advanced_prices"))
            .unwrap_or_default(),
        min_purchase: r.get::<i32, _>("min_purchase") as u32,
        purchase_steps: r.get::<i32, _>("purchase_steps") as u32,
        max_purchase: r.get::<Option<i32>, _>("max_purchase").map(|v| v as u32),
        reference_price: r
            .get::<Option<Value>, _>("reference_price")
            .and_then(|v| serde_json::from_value(v).ok()),
    }
}
pub(crate) async fn prototype_products(a: &App, t: &str) -> Result<Vec<Product>> {
    Ok(sqlx::query(
        "SELECT * FROM products WHERE tenant=$1 AND parent_id IS NULL ORDER BY id LIMIT 101",
    )
    .bind(t)
    .fetch_all(&a.db)
    .await?
    .iter()
    .map(product)
    .collect())
}
