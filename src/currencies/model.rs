//! Explicit currency scales and rational exchange-rate settings, inherited by sales-channel overrides.
use super::*;
pub(crate) const CODES: &str = "EUR USD GBP CHF CAD AUD NZD JPY CNY HKD SGD SEK NOK DKK PLN CZK HUF RON BGN ISK TRY BRL MXN INR IDR ILS ZAR KRW THB MYR PHP BHD KWD OMR JOD TND CLP AED SAR";
pub(crate) fn scale(code: &str) -> Option<u8> {
    CODES.split(' ').find(|c| *c == code).map(|_| match code {
        "JPY" | "KRW" | "CLP" => 0,
        "BHD" | "KWD" | "OMR" | "JOD" | "TND" => 3,
        _ => 2,
    })
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Definition {
    pub code: String,
    pub scale: u8,
    pub rate: String,
    pub strategy: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Config {
    pub base_currency: String,
    #[serde(default = "legacy_source")]
    pub pricing_currency: String,
    pub default_currency: String,
    pub enabled: Vec<String>,
    pub definitions: Vec<Definition>,
    pub auto_refresh: bool,
    pub rate_source: String,
    pub rate_date: Option<String>,
}
fn legacy_source() -> String {
    "EUR".into()
}
impl Default for Config {
    fn default() -> Self {
        Self {
            pricing_currency: "EUR".into(),
            base_currency: "EUR".into(),
            default_currency: "EUR".into(),
            enabled: vec!["EUR".into()],
            definitions: vec![Definition {
                code: "EUR".into(),
                scale: 2,
                rate: "1.00000000".into(),
                strategy: "automatic".into(),
            }],
            auto_refresh: false,
            rate_source: "manual".into(),
            rate_date: None,
        }
    }
}
pub(crate) fn rate_units(rate: &str) -> Result<i64> {
    let (whole, frac) = rate.split_once('.').unwrap_or((rate, ""));
    if whole.is_empty()
        || frac.len() > 8
        || !whole
            .bytes()
            .chain(frac.bytes())
            .all(|b| b.is_ascii_digit())
    {
        return Err(bad(
            "Rate must be a positive decimal with at most eight decimal places",
        ));
    }
    let n = whole
        .parse::<i64>()
        .ok()
        .and_then(|w| w.checked_mul(100_000_000))
        .and_then(|w| {
            (if frac.is_empty() {
                Some(0)
            } else {
                frac.parse::<i64>().ok()
            })
            .and_then(|f| w.checked_add(f * 10_i64.pow((8 - frac.len()) as u32)))
        })
        .ok_or(bad("Rate overflow"))?;
    if n <= 0 || n > 100_000_000_000_000 {
        return Err(bad("Rate out of bounds"));
    }
    Ok(n)
}
impl Config {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.definitions.is_empty()
            || self.definitions.len() > 40
            || self.enabled.is_empty()
            || self.enabled.len() > 40
            || !self.enabled.contains(&self.default_currency)
            || !["manual", "ecb"].contains(&self.rate_source.as_str())
        {
            return Err(bad("Invalid currency configuration"));
        }
        let mut codes = std::collections::HashSet::new();
        for d in &self.definitions {
            if scale(&d.code) != Some(d.scale)
                || !codes.insert(d.code.as_str())
                || !["automatic", "fixed"].contains(&d.strategy.as_str())
            {
                return Err(bad("Invalid currency definition"));
            }
            rate_units(&d.rate)?;
        }
        if !codes.contains(self.pricing_currency.as_str()) {
            return Err(bad("Original catalogue currency must remain configured"));
        }
        if self.enabled.iter().any(|c| !codes.contains(c.as_str()))
            || self
                .enabled
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != self.enabled.len()
            || self
                .definitions
                .iter()
                .find(|d| d.code == self.base_currency)
                .is_none_or(|d| rate_units(&d.rate).ok() != Some(100_000_000))
        {
            return Err(bad(
                "Base rate must be one; enabled currencies must be unique and configured",
            ));
        }
        if let Some(date) = &self.rate_date {
            chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map_err(|_| bad("Invalid rate date"))?;
        }
        Ok(())
    }
    pub(crate) fn selected(&self, code: &str) -> Result<&Definition> {
        let code = if code.is_empty() {
            &self.default_currency
        } else {
            code
        };
        let enabled = self.enabled.iter().any(|c| c == code);
        let d = self.definitions.iter().find(|d| d.code == code);
        let fresh = (code == self.base_currency && code == self.pricing_currency)
            || self.rate_source == "manual"
            || self
                .rate_date
                .as_ref()
                .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
                .is_some_and(|d| {
                    let age = (chrono::Utc::now().date_naive() - d).num_days();
                    (0..=7).contains(&age)
                });
        if !verified_kernel::currency_context_admissible(enabled, d.is_some(), fresh) {
            return Err(conflict(
                "Currency unavailable or exchange rate stale; refresh and review checkout",
            ));
        }
        Ok(d.unwrap())
    }
}
