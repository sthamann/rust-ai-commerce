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
    #[serde(default)]
    pub billing_address: Option<Address>,
    #[serde(default)]
    pub shipping_address_id: Option<String>,
    #[serde(default)]
    pub billing_address_id: Option<String>,
    #[serde(default)]
    pub customer_email: Option<String>,
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
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Address {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub first_name: String,
    #[serde(default)]
    pub last_name: String,
    #[serde(default)]
    pub salutation_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub company: String,
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub vat_id: String,
    pub street: String,
    #[serde(alias = "zipcode")]
    pub postal_code: String,
    pub city: String,
    #[serde(default = "country_default")]
    pub country: String,
    #[serde(default)]
    pub country_state_id: String,
    #[serde(default)]
    pub additional_address_line1: String,
    #[serde(default)]
    pub additional_address_line2: String,
    #[serde(default)]
    pub phone_number: String,
}
impl Address {
    pub(crate) fn validate(&mut self) -> Result<()> {
        if self.name.trim().is_empty() {
            self.name = format!("{} {}", self.first_name.trim(), self.last_name.trim())
                .trim()
                .into();
        }
        for s in [&self.name, &self.street, &self.postal_code, &self.city] {
            if s.trim().is_empty() || s.len() > 160 {
                return Err(bad(
                    "Complete address fields required (maximum 160 characters)",
                ));
            }
        }
        if self.country.len() != 2 || !self.country.bytes().all(|c| c.is_ascii_uppercase()) {
            return Err(bad("Address country must be an ISO country code"));
        }
        for s in [
            &self.first_name,
            &self.last_name,
            &self.salutation_id,
            &self.title,
            &self.company,
            &self.department,
            &self.vat_id,
            &self.country_state_id,
            &self.additional_address_line1,
            &self.additional_address_line2,
            &self.phone_number,
        ] {
            if s.len() > 160 || s.chars().any(|c| c.is_control()) {
                return Err(bad("Invalid address field"));
            }
        }
        Ok(())
    }
}
impl CheckoutSelection {
    pub fn defaults() -> Self {
        Self {
            country: country_default(),
            shipping_method_id: shipping_default(),
            payment_method_id: payment_default(),
            address: None,
            billing_address: None,
            shipping_address_id: None,
            billing_address_id: None,
            customer_email: None,
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Settings {
    #[serde(default = "main_locale")]
    pub main_locale: String,
    #[serde(default = "content_locales")]
    pub locales: Vec<String>,
    #[serde(default)]
    pub country_definitions: Vec<super::geography::Country>,
    pub countries: Vec<String>,
    pub taxes: Vec<TaxConfig>,
    pub shipping: Vec<Shipping>,
    pub payments: Vec<Payment>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TaxConfig {
    pub id: String,
    pub rates: HashMap<String, f64>,
    #[serde(default)]
    pub translations: HashMap<String, super::method_text::Text>,
    #[serde(default)]
    pub default_rate: Option<f64>,
    #[serde(default)]
    pub rules: Vec<super::tax_rules::DestinationRule>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Shipping {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub translations: HashMap<String, super::method_text::Text>,
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
    #[serde(default)]
    pub translations: HashMap<String, super::method_text::Text>,
    #[serde(default)]
    pub countries: Vec<String>,
    #[serde(default)]
    pub restricted_countries: bool,
    pub active: bool,
    pub business_only: bool,
    pub mode: String,
}
pub(crate) fn main_locale() -> String {
    "en-GB".into()
}
pub(crate) fn content_locales() -> Vec<String> {
    ["en-GB", "de-DE", "es-ES", "fr-FR"]
        .map(String::from)
        .to_vec()
}

impl Payment {
    pub(crate) fn available_in(&self, country: &str) -> bool {
        (!self.restricted_countries && self.countries.is_empty())
            || self.countries.iter().any(|c| c == country)
    }
}
