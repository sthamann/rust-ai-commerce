//! Exact rational minor-unit FX conversion at the isolated legacy calculator boundary; fixed prices are explicit decimal strings.
use super::*;
use vendune::money::{Currency, Money};
pub(crate) fn amount(value: f64, code: &str, precision: u8) -> Result<Money> {
    let minor = (value * 10_f64.powi(precision as i32)).round();
    if !value.is_finite() || value < 0. || !minor.is_finite() || minor >= 9_223_372_036_854_775_808.
    {
        return Err(bad("Invalid currency amount"));
    }
    Ok(Money::new(
        minor as i64,
        Currency::new(code, precision).map_err(bad)?,
    ))
}
pub(crate) fn convert(value: f64, cfg: &Config, d: &Definition) -> Result<f64> {
    convert_from(value, &cfg.pricing_currency, cfg, d)
}
pub(crate) fn convert_from(value: f64, code: &str, cfg: &Config, d: &Definition) -> Result<f64> {
    if d.code == code {
        return Ok(value);
    }
    let source = amount(
        value,
        code,
        scale(code).ok_or(bad("Invalid price source currency"))?,
    )?;
    let source_rate = cfg
        .definitions
        .iter()
        .find(|v| v.code == code)
        .ok_or(bad("Source price currency is not configured"))?;
    let numerator = (source.minor() as i128)
        .checked_mul(rate_units(&d.rate)? as i128)
        .and_then(|v| v.checked_mul(10_i128.pow(d.scale as u32)))
        .ok_or(bad("FX overflow"))?;
    let denominator =
        rate_units(&source_rate.rate)? as i128 * 10_i128.pow(source.currency().scale() as u32);
    let minor = i64::try_from((numerator + denominator / 2) / denominator)
        .map_err(|_| bad("FX overflow"))?;
    Ok(minor as f64 / 10_f64.powi(d.scale as i32))
}
pub(crate) fn product_price(p: &Product, cfg: &Config, d: &Definition) -> Result<f64> {
    if d.strategy == "fixed"
        && let Some(s) = p.extra["currencyPrices"][&d.code]["price"].as_str()
    {
        return Ok(
            Money::parse(s, Currency::new(&d.code, d.scale).map_err(bad)?)
                .map_err(bad)?
                .minor() as f64
                / 10_f64.powi(d.scale as i32),
        );
    }
    convert_from(
        p.price,
        p.extra["priceCurrency"]
            .as_str()
            .unwrap_or(&cfg.pricing_currency),
        cfg,
        d,
    )
}
pub(crate) fn ancillary(
    p: &Product,
    field: &str,
    value: Option<f64>,
    cfg: &Config,
    d: &Definition,
) -> Result<Option<f64>> {
    if d.strategy == "fixed"
        && let Some(s) = p.extra["currencyPrices"][&d.code][field].as_str()
    {
        return Ok(Some(
            Money::parse(s, Currency::new(&d.code, d.scale).map_err(bad)?)
                .map_err(bad)?
                .minor() as f64
                / 10_f64.powi(d.scale as i32),
        ));
    }
    value
        .map(|v| {
            convert_from(
                v,
                p.extra["priceCurrency"]
                    .as_str()
                    .unwrap_or(&cfg.pricing_currency),
                cfg,
                d,
            )
        })
        .transpose()
}
pub(crate) fn validate_prices(v: &Value, cfg: &Config) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    let map = v
        .as_object()
        .filter(|v| v.len() <= 40)
        .ok_or(bad("Currency prices must be an object"))?;
    for (code, prices) in map {
        let d = cfg
            .definitions
            .iter()
            .find(|d| &d.code == code)
            .ok_or(bad("Unknown product currency"))?;
        let values = prices.as_object().ok_or(bad("Invalid currency prices"))?;
        if values.len() > 4 || !values.contains_key("price") {
            return Err(bad("Currency price required"));
        }
        for (field, value) in values {
            if field == "generatedAt" {
                if value.as_str().is_none_or(|s| s.len() > 64) {
                    return Err(bad("Invalid price provenance"));
                }
                continue;
            }
            if !["price", "listPrice", "regulationPrice"].contains(&field.as_str()) {
                return Err(bad("Unknown currency price field"));
            }
            if value.is_null() && field != "price" {
                continue;
            }
            let m = Money::parse(
                value.as_str().ok_or(bad("Exact decimal string required"))?,
                Currency::new(code, d.scale).map_err(bad)?,
            )
            .map_err(bad)?;
            if m.minor() < 0 || m.minor() > 1_000_000_000_000 {
                return Err(bad("Currency price out of bounds"));
            }
        }
    }
    Ok(())
}
pub(crate) fn context(cfg: &Config, d: &Definition) -> Value {
    json!({"code":d.code,"scale":d.scale,"factor":d.rate,"baseCurrency":cfg.base_currency,"pricingCurrency":cfg.pricing_currency,"pricingFactor":cfg.definitions.iter().find(|v|v.code==cfg.pricing_currency).map(|v|v.rate.as_str()),"strategy":d.strategy,"rateSource":cfg.rate_source,"rateDate":cfg.rate_date})
}
pub(crate) fn requested(h: &RequestContext, cart: Option<&StoredCart>) -> String {
    cart.map(|c| c.data.currency.clone())
        .unwrap_or_else(|| header(h, "x-commerce-currency").unwrap_or("").into())
}
