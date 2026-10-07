//! Currency conversion adversaries and immutable source-price semantics, independent of live rate providers.
use super::*;
fn config() -> Config {
    let mut c = Config::default();
    for (code, rate, strategy) in [
        ("USD", "1.25", "automatic"),
        ("JPY", "160", "automatic"),
        ("KWD", "0.33333333", "fixed"),
    ] {
        c.enabled.push(code.into());
        c.definitions.push(Definition {
            code: code.into(),
            scale: scale(code).unwrap(),
            rate: rate.into(),
            strategy: strategy.into(),
        });
    }
    c
}
#[test]
fn decimal_rates_are_bounded_and_do_not_accept_float_syntax() {
    assert_eq!(rate_units("1.25000000").unwrap(), 125_000_000);
    for s in [
        "0",
        "-1",
        "NaN",
        "1e2",
        "1.123456789",
        "999999999999999999999",
        "1..2",
        "",
    ] {
        assert!(rate_units(s).is_err(), "{s}");
    }
}
#[test]
fn conversion_is_rounded_once_at_explicit_zero_two_and_three_digit_scales() {
    let c = config();
    assert_eq!(convert(9.9, &c, c.selected("USD").unwrap()).unwrap(), 12.38);
    assert_eq!(convert(9.9, &c, c.selected("JPY").unwrap()).unwrap(), 1584.);
    assert_eq!(convert(9.9, &c, c.selected("KWD").unwrap()).unwrap(), 3.3);
    assert_eq!(amount(7.123, "KWD", 3).unwrap().minor(), 7123);
    for n in [f64::NAN, f64::INFINITY, -1., 1e30] {
        assert!(amount(n, "USD", 2).is_err());
    }
}
#[test]
fn changed_exchange_base_preserves_original_monetary_source() {
    let mut c = config();
    let old = convert(79.95, &c, c.selected("USD").unwrap()).unwrap();
    c.base_currency = "USD".into();
    for d in &mut c.definitions {
        d.rate = format!("{:.8}", d.rate.parse::<f64>().unwrap() / 1.25);
    }
    c.validate().unwrap();
    assert_eq!(convert(79.95, &c, c.selected("USD").unwrap()).unwrap(), old);
    assert_eq!(
        convert_from(12.34, "USD", &c, c.selected("USD").unwrap()).unwrap(),
        12.34
    );
}
#[test]
fn fixed_decimal_prices_reject_invalid_precision_and_unknown_codes() {
    let c = config();
    assert!(validate_prices(&json!({"KWD":{"price":"7.123"}}), &c).is_ok());
    for v in [
        json!({"USD":{"price":"1.234"}}),
        json!({"KWD":{"price":1.123}}),
        json!({"XXX":{"price":"1"}}),
        json!({"USD":{"price":"-1"}}),
    ] {
        assert!(validate_prices(&v, &c).is_err());
    }
}
#[test]
fn ecb_cross_rates_and_stale_missing_duplicate_results_fail_closed() {
    let c = config();
    let date = chrono::Utc::now().date_naive();
    let xml = format!(
        "<Cube time='{date}'><Cube currency='USD' rate='1.25'/><Cube currency='JPY' rate='160'/><Cube currency='KWD' rate='0.33333333'/></Cube>"
    );
    let fresh = rates::parse(&c, &xml).unwrap();
    assert_eq!(fresh.rate_source, "ecb");
    assert_eq!(fresh.selected("USD").unwrap().rate, "1.25000000");
    let mut usd = c.clone();
    usd.base_currency = "USD".into();
    assert_eq!(
        rates::parse(&usd, &xml).unwrap().definitions[0].rate,
        "0.80000000"
    );
    assert!(rates::parse(&c, &xml.replace("<Cube currency='JPY' rate='160'/>", "")).is_err());
    assert!(rates::parse(&c, &format!("{xml}<Cube currency='USD' rate='1.25'/>")).is_err());
    assert!(rates::parse(&c, &xml.replace(&date.to_string(), "2000-01-01")).is_err());
    let mut stale = fresh;
    stale.rate_date = Some("2000-01-01".into());
    assert!(stale.selected("USD").is_err());
    assert!(stale.selected("EUR").is_ok());
}
#[test]
fn selected_currency_rejects_channel_exclusion_and_unsupported_scale() {
    let mut c = config();
    c.enabled = vec!["EUR".into()];
    assert!(c.selected("USD").is_err());
    c.definitions[1].scale = 0;
    assert!(c.validate().is_err());
}
