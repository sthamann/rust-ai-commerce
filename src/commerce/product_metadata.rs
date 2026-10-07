//! Typed product edit payload and multilingual metadata including exact currency prices.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Edit {
    #[serde(default, rename = "id")]
    pub(super) _id: Option<String>,
    #[serde(default, rename = "channels")]
    pub(super) _channels: Value,
    #[serde(default, rename = "mainLocale")]
    pub(super) _main_locale: Value,
    #[serde(default, rename = "availableLocales")]
    pub(super) _available_locales: Value,
    pub(super) revision: i64,
    pub(super) translations: HashMap<String, Translation>,
    pub(super) extra: Extra,
    #[serde(default)]
    pub(super) commerce: Option<ProductFields>,
    #[serde(default)]
    pub(super) catalog: Option<CatalogFields>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Translation {
    #[serde(default)]
    pub(super) name: Option<String>,
    #[serde(default)]
    pub(super) description: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Extra {
    #[serde(default)]
    pub(super) currency_prices: Value,
    #[serde(default)]
    pub(super) price_currency: Option<String>,
    #[serde(default)]
    pub(super) demo: Value,
    #[serde(default)]
    pub(super) automation: Value,
    #[serde(default)]
    pub(super) tax_class_id: Option<String>,
    #[serde(default)]
    pub(super) seo: HashMap<String, Seo>,
    #[serde(default)]
    pub(super) specifications: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub(super) cross_selling: Vec<String>,
    #[serde(default)]
    pub(super) shipping_free: bool,
    #[serde(default)]
    pub(super) digital: bool,
    #[serde(default)]
    pub(super) rich_description: Value,
    #[serde(default)]
    pub(super) identity: Value,
    #[serde(default)]
    pub(super) compliance: Value,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Seo {
    #[serde(default)]
    pub(super) title: Option<String>,
    #[serde(default)]
    pub(super) description: Option<String>,
    #[serde(default)]
    pub(super) slug: Option<String>,
}
