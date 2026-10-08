//! Merchant-owned guardrails in commerce settings; native currency amounts bind preview and execution.
use super::*;
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Config {
    #[serde(default)]
    pub corridors: Vec<Corridor>,
    #[serde(default)]
    pub autonomy: Autonomy,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Corridor {
    pub product_id: String,
    pub currency: String,
    pub minimum_minor: u64,
    pub maximum_minor: u64,
    #[serde(default)]
    pub minimum_margin_bps: u16,
    #[serde(default)]
    pub unit_cost_net_minor: Option<u64>,
    #[serde(default)]
    pub maximum_discount_bps: Option<u16>,
    #[serde(default)]
    pub price_locked: bool,
    #[serde(default)]
    pub require_available: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Autonomy {
    pub enabled: bool,
    pub max_change_bps: u16,
    pub products_per_day: u16,
}
impl Default for Autonomy {
    fn default() -> Self {
        Self {
            enabled: false,
            max_change_bps: 500,
            products_per_day: 20,
        }
    }
}
impl Config {
    pub(crate) fn validate(&self, s: &commerce::Settings) -> Result<()> {
        let mut ids = std::collections::HashSet::new();
        if self.corridors.len() > 1000
            || self.autonomy.max_change_bps > 500
            || !(1..=100).contains(&self.autonomy.products_per_day)
        {
            return Err(bad("AI guardrail limits exceeded"));
        }
        for r in &self.corridors {
            if !ids.insert(&r.product_id)
                || r.product_id.is_empty()
                || r.product_id.len() > 160
                || r.minimum_minor > r.maximum_minor
                || r.maximum_minor > 1_000_000_000_000
                || r.minimum_margin_bps >= 10000
                || r.minimum_margin_bps > 0 && r.unit_cost_net_minor.is_none()
                || r.maximum_discount_bps.is_some_and(|v| v > 10000)
                || !s
                    .currencies
                    .definitions
                    .iter()
                    .any(|d| d.code == r.currency)
            {
                return Err(bad("Invalid AI product corridor or cost/margin basis"));
            }
        }
        Ok(())
    }
}
pub(crate) fn check(
    s: &commerce::Settings,
    p: &Product,
    c: &Change,
    autonomous: bool,
) -> Result<()> {
    let Some(price) = c.price else {
        return Ok(());
    };
    let code = p.extra["priceCurrency"]
        .as_str()
        .unwrap_or(&s.currencies.pricing_currency);
    let scale = s
        .currencies
        .definitions
        .iter()
        .find(|d| d.code == code)
        .ok_or(bad("Product price currency is not configured"))?
        .scale;
    let proposed = currencies::amount(price, code, scale)?.minor() as u64;
    let before = currencies::amount(p.price, code, scale)?.minor() as u64;
    let rule = s.ai_policy.corridors.iter().find(|r| r.product_id == p.id);
    if autonomous && rule.is_none() {
        return Err(bad("Autonomy requires an explicit product corridor"));
    }
    if let Some(r) = rule {
        if r.currency != code {
            return Err(conflict(
                "AI corridor currency differs from product pricing currency",
            ));
        }
        // Base gross prices preserve the product's native base tax. This margin excludes shipping, fees and returns.
        let tax = (p.tax_rate * 100.).round();
        if !tax.is_finite() || !(0.0..=10000.0).contains(&tax) {
            return Err(bad("Invalid product tax basis"));
        }
        let net = (proposed as u128) * 10000 / (10000 + tax as u128);
        let margin = r.unit_cost_net_minor.is_none_or(|cost| {
            net * u128::from(10000 - r.minimum_margin_bps) >= u128::from(cost) * 10000
        });
        let discount = r.maximum_discount_bps.is_none_or(|limit| {
            (proposed as u128) * 10000 >= (before as u128) * u128::from(10000 - limit)
        });
        if !verified_kernel::ai_price_admissible(
            proposed,
            r.minimum_minor,
            r.maximum_minor,
            margin,
            discount,
            !r.price_locked || proposed == before,
            !r.require_available || p.stock > 0,
        ) {
            return Err(conflict(
                "AI proposal violates current price, margin, discount, brand or availability guardrails",
            ));
        }
    }
    if autonomous {
        let delta = before.abs_diff(proposed) as u128;
        if !verified_kernel::ai_autonomy_admissible(
            s.ai_policy.autonomy.enabled,
            true,
            c.stock.is_none(),
            true,
            delta * 10000 <= before as u128 * u128::from(s.ai_policy.autonomy.max_change_bps),
        ) {
            return Err(conflict("Autonomous price change exceeds current policy"));
        }
    }
    Ok(())
}
pub(crate) async fn validate_plan(a: &App, t: &str, p: &Proposal, ps: &[Product]) -> Result<i64> {
    let (settings, revision) = commerce::config(a, t).await?;
    for c in &p.changes {
        check(
            &settings,
            ps.iter()
                .find(|p| p.id == c.product_id)
                .ok_or(bad("Unknown product"))?,
            c,
            false,
        )?;
    }
    Ok(revision)
}
