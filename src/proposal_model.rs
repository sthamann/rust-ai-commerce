//! Typed proposals and validation before persistence or execution.
use crate::*;

// One constrained capability model drives agent plans, MCP and merchant writes.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct Change {
    pub(crate) product_id: String,
    #[serde(default)]
    pub(crate) expected_revision: i64,
    #[serde(default)]
    pub(crate) price: Option<f64>,
    #[serde(default)]
    pub(crate) stock: Option<i32>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct Proposal {
    pub(crate) summary: String,
    pub(crate) changes: Vec<Change>,
    #[serde(default)]
    pub(crate) experience: Option<Value>,
    #[serde(default)]
    pub(crate) expected_experience_revision: Option<i64>,
}
pub(crate) fn validate_experience(v: &Value) -> Result<()> {
    if !v.is_object() {
        return Err(bad("Experience must be an object"));
    }
    if !["balanced", "discovery", "comparison"].contains(&v["mode"].as_str().unwrap_or("")) {
        return Err(bad("Invalid experience mode"));
    }
    if v["headline"].as_str().is_none_or(|s| s.len() > 200) {
        return Err(bad("Experience headline must be <= 200 characters"));
    }
    Ok(())
}
pub(crate) fn validate_proposal(p: &Proposal, ps: &[Product]) -> Result<()> {
    if p.changes.len() > 100 || p.summary.len() > 2000 {
        return Err(bad("Proposal is too large"));
    }
    let mut ids = std::collections::HashSet::new();
    for c in &p.changes {
        if !ids.insert(&c.product_id) {
            return Err(bad("Duplicate product change"));
        }
        let product = ps
            .iter()
            .find(|p| p.id == c.product_id)
            .ok_or(bad("Unknown product in plan"))?;
        if c.expected_revision != product.revision {
            return Err(conflict("Model used a stale product revision"));
        }
        if c.price
            .is_some_and(|p| !p.is_finite() || !(0.01..=1_000_000.).contains(&p))
            || c.stock.is_some_and(|s| !(0..=1_000_000).contains(&s))
        {
            return Err(bad("Change outside allowed range"));
        }
    }
    if let Some(e) = &p.experience {
        validate_experience(e)?;
        if p.expected_experience_revision.is_none() {
            return Err(bad("Experience revision required"));
        }
    }
    Ok(())
}
