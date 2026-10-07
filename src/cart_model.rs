//! Persisted cart, item and customer-context types.
use crate::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Item {
    pub(crate) id: String,
    pub(crate) quantity: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Cart {
    #[serde(default)]
    pub(crate) coupons: Vec<String>,
    #[serde(default)]
    pub(crate) currency: String,
    #[serde(default = "default_channel")]
    pub(crate) sales_channel: String,
    #[serde(default)]
    pub(crate) app_configurations: HashMap<String, apps::Configuration>,
    pub(crate) items: Vec<Item>,
    pub(crate) group: String,
    pub(crate) email: Option<String>,
    #[serde(default)]
    pub(crate) customer_id: Option<String>,
    pub(crate) company: Option<String>,
    pub(crate) session: String,
    pub(crate) buyer: Option<Value>,
    pub(crate) order: Option<Value>,
    #[serde(default)]
    pub(crate) locale: String,
    #[serde(default)]
    pub(crate) channel: String,
    #[serde(default)]
    pub(crate) checkout: Option<commerce::CheckoutSelection>,
}
#[derive(Clone)]
pub(crate) struct StoredCart {
    pub(crate) id: String,
    pub(crate) tenant: String,
    pub(crate) token: String,
    pub(crate) data: Cart,
    pub(crate) revision: i64,
    pub(crate) status: String,
}
pub(crate) fn stored(r: &sqlx::postgres::PgRow) -> Result<StoredCart> {
    let mut data: Value = r.get("data");
    apps::upgrade_cart(&mut data);
    Ok(StoredCart {
        id: r.get("id"),
        tenant: r.get("tenant"),
        token: r.get("token"),
        data: serde_json::from_value(data).map_err(|e| bad(e.to_string()))?,
        revision: r.get("revision"),
        status: r.get("status"),
    })
}

pub(crate) fn default_channel() -> String {
    "default".into()
}
