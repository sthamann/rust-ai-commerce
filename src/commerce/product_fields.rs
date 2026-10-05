//! Native product administration writes priced fields under the same revision and inventory row lock.
use super::*;
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ProductFields {
    pub price: f64,
    pub tax_rate: f64,
    pub stock: i32,
    pub min_purchase: u32,
    pub purchase_steps: u32,
    pub max_purchase: Option<u32>,
    pub delivery_days: i32,
    pub list_price: Option<f64>,
    #[serde(default)]
    pub regulation_price: Option<f64>,
    #[serde(default)]
    pub reference_price: Option<vendune::pricing::ReferenceDefinition>,
    pub advanced_prices: Vec<vendune::context::Tier>,
    pub media: Value,
    pub properties: HashMap<String, String>,
}
impl ProductFields {
    pub(crate) fn validate(&self) -> Result<()> {
        if !self.price.is_finite()
            || !(0.0..=1_000_000.).contains(&self.price)
            || !self.tax_rate.is_finite()
            || !(0.0..=50.).contains(&self.tax_rate)
            || self.stock < 0
            || self.min_purchase == 0
            || self.min_purchase > 1_000_000
            || self.purchase_steps == 0
            || self.purchase_steps > 1_000_000
            || self
                .max_purchase
                .is_some_and(|v| v < self.min_purchase || v > 1_000_000)
            || !(0..=365).contains(&self.delivery_days)
            || self
                .list_price
                .is_some_and(|v| !v.is_finite() || v < 0. || v > 1_000_000.)
            || self.advanced_prices.len() > 100
            || self.properties.len() > 40
            || self
                .properties
                .iter()
                .any(|(k, v)| k.is_empty() || k.len() > 100 || v.len() > 1000)
        {
            return Err(bad("Invalid product commerce fields"));
        }
        if self
            .regulation_price
            .is_some_and(|n| !n.is_finite() || !(0.0..=1_000_000.0).contains(&n))
            || self.reference_price.as_ref().is_some_and(|p| {
                !p.purchase_unit.is_finite()
                    || p.purchase_unit <= 0.
                    || !p.reference_unit.is_finite()
                    || p.reference_unit <= 0.
                    || p.unit_name.is_empty()
                    || p.unit_name.len() > 80
            })
        {
            return Err(bad("Invalid regulation or reference price"));
        }
        for tier in &self.advanced_prices {
            if tier.quantity_start == 0
                || tier.quantity_end.is_some_and(|n| n < tier.quantity_start)
                || !tier.discount.is_finite()
                || !(0.0..=1.).contains(&tier.discount)
                || tier.rule_id.len() > 100
            {
                return Err(bad("Invalid price tier"));
            }
        }
        let media = self
            .media
            .as_array()
            .filter(|a| a.len() <= 20)
            .ok_or(bad("Product media must be a bounded array"))?;
        for m in media {
            let url = m["url"].as_str().ok_or(bad("Media URL required"))?;
            let local = url.starts_with("/store-api/assets/")
                || url.starts_with("/assets/")
                || url.starts_with("/media/");
            if !local
                && !reqwest::Url::parse(url).is_ok_and(|u| {
                    u.scheme() == "https" && u.username().is_empty() && u.password().is_none()
                })
            {
                return Err(bad("Unsafe product media URL"));
            }
            if m["id"].as_str().is_none_or(|s| s.len() > 100)
                || m["view"].as_str().is_none_or(|s| s.len() > 100)
            {
                return Err(bad("Invalid product media labels"));
            }
        }
        Ok(())
    }
    pub(crate) async fn save(&self, tx: &mut sqlx::PgConnection, t: &str, id: &str) -> Result<()> {
        sqlx::query("UPDATE products SET price=$1,tax_rate=$2,stock=$3,min_purchase=$4,purchase_steps=$5,max_purchase=$6,delivery_days=$7,list_price=$8,advanced_prices=$9,media=$10,properties=$11 WHERE tenant=$12 AND id=$13").bind(self.price).bind(self.tax_rate).bind(self.stock).bind(self.min_purchase as i32).bind(self.purchase_steps as i32).bind(self.max_purchase.map(|n|n as i32)).bind(self.delivery_days).bind(self.list_price).bind(json!(self.advanced_prices)).bind(&self.media).bind(json!(self.properties)).bind(t).bind(id).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE products SET regulation_price=$1,reference_price=$2 WHERE tenant=$3 AND id=$4",
        )
        .bind(self.regulation_price)
        .bind(self.reference_price.as_ref().map(|p| json!(p)))
        .bind(t)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        Ok(())
    }
}
pub(crate) fn editable_fields(r: &sqlx::postgres::PgRow) -> Value {
    json!({"price":r.get::<f64,_>("price"),"taxRate":r.get::<f64,_>("tax_rate"),"stock":r.get::<i32,_>("stock"),"minPurchase":r.get::<i32,_>("min_purchase"),"purchaseSteps":r.get::<i32,_>("purchase_steps"),"maxPurchase":r.get::<Option<i32>,_>("max_purchase"),"deliveryDays":r.get::<i32,_>("delivery_days"),"listPrice":r.get::<Option<f64>,_>("list_price"),"regulationPrice":r.get::<Option<f64>,_>("regulation_price"),"referencePrice":r.get::<Option<Value>,_>("reference_price"),"advancedPrices":r.get::<Value,_>("advanced_prices"),"media":r.get::<Value,_>("media"),"properties":r.get::<Value,_>("properties")})
}
