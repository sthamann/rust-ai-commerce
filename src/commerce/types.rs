//! Checkout selection and configuration data contracts.
use super::*;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CheckoutSelection {
    #[serde(default = "country_default")]
    pub country: String,
    #[serde(default = "shipping_default")]
    pub shipping_method_id: String,
    #[serde(default = "payment_default")]
    pub payment_method_id: String,
    #[serde(default)]
    pub address: Option<Address>,
}
pub(crate) fn country_default() -> String {
    "DE".into()
}
pub(crate) fn shipping_default() -> String {
    "pickup".into()
}
pub(crate) fn payment_default() -> String {
    "demo-card".into()
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Address {
    pub name: String,
    pub street: String,
    pub postal_code: String,
    pub city: String,
}
impl CheckoutSelection {
    pub fn defaults() -> Self {
        Self {
            country: country_default(),
            shipping_method_id: shipping_default(),
            payment_method_id: payment_default(),
            address: None,
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Settings {
    pub countries: Vec<String>,
    pub taxes: Vec<TaxConfig>,
    pub shipping: Vec<Shipping>,
    pub payments: Vec<Payment>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TaxConfig {
    pub id: String,
    pub rates: HashMap<String, f64>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Shipping {
    pub id: String,
    pub name: String,
    pub price: f64,
    pub free_above: Option<f64>,
    pub min_days: i32,
    pub max_days: i32,
    pub countries: Vec<String>,
    pub active: bool,
    pub tax_type: String,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Payment {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub business_only: bool,
    pub mode: String,
}
