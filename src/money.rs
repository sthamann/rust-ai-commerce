//! Exact signed minor-unit amounts with explicit currency scale; legacy Shopware float pricing stays isolated.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "CurrencyWire")]
pub struct Currency {
    code: String,
    scale: u8,
}
#[derive(Deserialize)]
struct CurrencyWire {
    code: String,
    scale: u8,
}
impl TryFrom<CurrencyWire> for Currency {
    type Error = &'static str;
    fn try_from(v: CurrencyWire) -> Result<Self, Self::Error> {
        Self::new(&v.code, v.scale)
    }
}
impl Currency {
    pub fn new(code: &str, scale: u8) -> Result<Self, &'static str> {
        if code.len() != 3
            || !code.bytes().all(|b| b.is_ascii_uppercase())
            || !crate::verified_kernel::currency_scale_admissible(u64::from(scale))
        {
            return Err("Invalid currency code or scale");
        }
        Ok(Self {
            code: code.into(),
            scale,
        })
    }
    pub fn eur() -> Self {
        Self {
            code: "EUR".into(),
            scale: 2,
        }
    }
    pub fn code(&self) -> &str {
        &self.code
    }
    pub fn scale(&self) -> u8 {
        self.scale
    }
    fn factor(&self) -> i64 {
        10_i64.pow(self.scale.into())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Money {
    minor: i64,
    currency: Currency,
}
impl Money {
    pub fn new(minor: i64, currency: Currency) -> Self {
        Self { minor, currency }
    }
    pub fn minor(&self) -> i64 {
        self.minor
    }
    pub fn currency(&self) -> &Currency {
        &self.currency
    }
    /// Integer decimal parsing: no exponent, floating-point intermediary, truncation or hidden rounding.
    pub fn parse(value: &str, currency: Currency) -> Result<Self, &'static str> {
        let (negative, value) = value
            .strip_prefix('-')
            .map(|v| (true, v))
            .unwrap_or((false, value));
        let (major, fraction) = value.split_once('.').unwrap_or((value, ""));
        if major.is_empty()
            || !major.bytes().all(|b| b.is_ascii_digit())
            || fraction.len() != currency.scale as usize
            || !fraction.bytes().all(|b| b.is_ascii_digit())
            || currency.scale == 0 && value.contains('.')
        {
            return Err("Amount must use the exact configured currency scale");
        }
        let major = major.parse::<i128>().map_err(|_| "Amount overflow")?;
        let fraction = if fraction.is_empty() {
            0
        } else {
            fraction.parse::<i128>().map_err(|_| "Amount overflow")?
        };
        let absolute = major
            .checked_mul(currency.factor() as i128)
            .and_then(|v| v.checked_add(fraction))
            .ok_or("Amount overflow")?;
        let signed = if negative { -absolute } else { absolute };
        Ok(Self::new(
            i64::try_from(signed).map_err(|_| "Amount overflow")?,
            currency,
        ))
    }
    pub fn decimal(&self) -> String {
        let absolute = self.minor.unsigned_abs();
        let factor = self.currency.factor() as u64;
        let sign = if self.minor < 0 { "-" } else { "" };
        if self.currency.scale == 0 {
            format!("{sign}{absolute}")
        } else {
            format!(
                "{sign}{}.{:0width$}",
                absolute / factor,
                absolute % factor,
                width = self.currency.scale as usize
            )
        }
    }
    pub fn checked_add(&self, other: &Self) -> Result<Self, &'static str> {
        if self.currency != other.currency {
            return Err("Currency or scale mismatch");
        }
        Ok(Self::new(
            self.minor
                .checked_add(other.minor)
                .ok_or("Amount overflow")?,
            self.currency.clone(),
        ))
    }
    /// Compatibility gate only: existing EUR checkout round behavior, with overflow/non-finite rejection.
    /// This is not a conversion of the Shopware price calculators to integer arithmetic.
    pub fn from_legacy_eur(total: f64) -> Result<Self, &'static str> {
        let minor = (total * 100.).round();
        if !total.is_finite()
            || total < 0.
            || !minor.is_finite()
            || minor >= 9_223_372_036_854_775_808.
        {
            return Err("Invalid legacy checkout amount");
        }
        Ok(Self::new(minor as i64, Currency::eur()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_roundtrip_including_signed_extremes_and_explicit_scales() {
        for scale in [0, 2, 3, 6] {
            let currency = Currency::new("XXX", scale).unwrap();
            for value in [i64::MIN, -101, -1, 0, 1, 101, i64::MAX] {
                let m = Money::new(value, currency.clone());
                assert_eq!(Money::parse(&m.decimal(), currency.clone()).unwrap(), m);
            }
        }
        assert_eq!(
            Money::new(1234, Currency::new("KWD", 3).unwrap()).decimal(),
            "1.234"
        );
        assert_eq!(
            Money::new(1234, Currency::new("JPY", 0).unwrap()).decimal(),
            "1234"
        );
    }
    #[test]
    fn mismatches_overflows_and_implicit_rounding_are_rejected() {
        let euro = Currency::eur();
        for s in [
            "1",
            "1.2",
            "1.234",
            "1e2",
            "NaN",
            "+1.00",
            " 1.00",
            "92233720368547758.08",
        ] {
            assert!(Money::parse(s, euro.clone()).is_err(), "{s}");
        }
        assert!(
            Money::new(i64::MAX, euro.clone())
                .checked_add(&Money::new(1, euro.clone()))
                .is_err()
        );
        assert!(
            Money::new(1, euro.clone())
                .checked_add(&Money::new(1, Currency::new("USD", 2).unwrap()))
                .is_err()
        );
        assert!(
            Money::new(1, euro)
                .checked_add(&Money::new(1, Currency::new("EUR", 3).unwrap()))
                .is_err()
        );
        for total in [
            f64::NAN,
            f64::INFINITY,
            -1.,
            -0.004,
            -f64::MIN_POSITIVE,
            1e30,
        ] {
            assert!(Money::from_legacy_eur(total).is_err());
        }
    }
    #[test]
    fn compatibility_boundary_preserves_old_rounding_for_supported_totals() {
        for n in 0..20000 {
            for fraction in [0., 0.0049, 0.005, 0.0051, 0.0099] {
                let total = n as f64 / 100. + fraction;
                assert_eq!(
                    Money::from_legacy_eur(total).unwrap().minor(),
                    (total * 100.).round() as i64
                );
            }
        }
    }
}
