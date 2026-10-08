//! Bind integer provider receipt amounts and status to the formally checked exact-match predicate.
use super::parse_amount;
use crate::{Result, Value, verified_kernel};

pub(crate) fn receipt_matches(
    expected: i64,
    amount: &Value,
    currency: &str,
    confirmed: bool,
) -> Result<bool> {
    let received = parse_amount(amount["value"].as_str().unwrap_or(""), currency)?;
    Ok(u64::try_from(expected)
        .ok()
        .zip(u64::try_from(received).ok())
        .is_some_and(|(expected, received)| {
            verified_kernel::receipt_admissible(
                expected,
                received,
                amount["currency_code"] == currency,
                confirmed,
            )
        }))
}
