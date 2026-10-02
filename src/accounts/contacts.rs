//! Customer-editable contact fields; identity, price group and privileges remain server-owned.
use crate::*;
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Contact {
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
    pub phone_number: String,
    #[serde(default)]
    pub birthday: Option<String>,
    #[serde(default)]
    pub company: String,
    #[serde(default)]
    pub vat_ids: Vec<String>,
    #[serde(default)]
    pub default_payment_method_id: Option<String>,
    #[serde(default)]
    pub address: Option<commerce::Address>,
}
impl Contact {
    pub(crate) fn validate(&mut self) -> Result<()> {
        if self.name.trim().is_empty() {
            self.name = format!("{} {}", self.first_name.trim(), self.last_name.trim())
                .trim()
                .into();
        }
        if self.name.trim().is_empty() || self.name.len() > 100 {
            return Err(bad("Customer name required"));
        }
        for s in [
            &self.first_name,
            &self.last_name,
            &self.salutation_id,
            &self.title,
            &self.phone_number,
            &self.company,
        ] {
            if s.len() > 200 || s.chars().any(|c| c.is_control()) {
                return Err(bad("Invalid customer contact field"));
            }
        }
        if self.vat_ids.len() > 10 || self.vat_ids.iter().any(|s| s.is_empty() || s.len() > 50) {
            return Err(bad("Invalid VAT IDs"));
        }
        if self.birthday.as_ref().is_some_and(|s| !valid_birthday(s)) {
            return Err(bad("Birthday requires a valid YYYY-MM-DD date"));
        }
        if let Some(a) = &mut self.address {
            a.validate()?;
        }
        Ok(())
    }
}
pub(crate) fn customer_value(r: &sqlx::postgres::PgRow) -> Value {
    json!({"id":r.get::<String,_>("id"),"customerNumber":r.get::<String,_>("customer_number"),"email":r.get::<String,_>("email"),"profile":r.get::<Value,_>("profile"),"company":r.get::<Option<String>,_>("company"),"customerGroup":r.get::<String,_>("group_name"),"active":r.get::<bool,_>("active"),"revision":r.get::<i64,_>("revision"),"defaultBillingAddressId":r.get::<Option<String>,_>("default_billing_address_id"),"defaultShippingAddressId":r.get::<Option<String>,_>("default_shipping_address_id"),"createdAt":r.get::<String,_>("created")})
}

fn valid_birthday(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
    {
        return false;
    }
    let y: u32 = s[..4].parse().unwrap_or(0);
    let m: usize = s[5..7].parse().unwrap_or(0);
    let d: u32 = s[8..].parse().unwrap_or(0);
    if !(1900..=2100).contains(&y) || !(1..=12).contains(&m) {
        return false;
    }
    let days = [
        31,
        if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) {
            29
        } else {
            28
        },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    d > 0 && d <= days[m - 1]
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_calendar_dates() {
        assert!(valid_birthday("2000-02-29"));
        for s in [
            "1900-02-29",
            "2026-02-31",
            "2026-00-01",
            "é026-01-01",
            "2026-11-00",
        ] {
            assert!(!valid_birthday(s), "{s}");
        }
    }
}
