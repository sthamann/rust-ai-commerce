//! Preregistered fixed-horizon experiment parameters and conservative bounded-outcome inference.
use crate::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Design {
    pub title: String,
    pub locale: String,
    pub channel: String,
    pub control: String,
    pub treatment: String,
    pub currency: String,
    pub duration_hours: i64,
    pub settlement_days: i64,
    pub minimum_per_arm: usize,
    pub outcome_cap_minor: i64,
    pub cuped_theta: f64,
}
impl Design {
    pub fn validate(&self) -> Result<()> {
        if self.title.trim().is_empty()
            || self.title.len() > 240
            || self.locale.len() > 64
            || !["discovery", "comparison"].contains(&self.control.as_str())
            || !["discovery", "comparison"].contains(&self.treatment.as_str())
            || self.control == self.treatment
            || !(1..=720).contains(&self.duration_hours)
            || !(14..=90).contains(&self.settlement_days)
            || !(100..=5000).contains(&self.minimum_per_arm)
            || !(1..=1_000_000_000_000).contains(&self.outcome_cap_minor)
            || !self.cuped_theta.is_finite()
            || !(0.0..=1.0).contains(&self.cuped_theta)
        {
            return Err(bad(
                "Invalid preregistration: distinct layouts, 1–720 hours, 14–90 settlement days, 100–5000 units per arm and bounded outcome required",
            ));
        }
        currencies::scale(&self.currency).ok_or(bad("Unsupported experiment currency"))?;
        Ok(())
    }
}
pub(super) fn interval(values: &[(usize, f64)], mature: bool, minimum: usize, theta: f64) -> Value {
    let mut n = [0usize; 2];
    let mut sums = [0.0; 2];
    for &(arm, x) in values {
        n[arm] += 1;
        sums[arm] += x;
    }
    let means = [
        if n[0] > 0 { sums[0] / n[0] as f64 } else { 0.0 },
        if n[1] > 0 { sums[1] / n[1] as f64 } else { 0.0 },
    ];
    let enough = n.iter().all(|n| *n >= minimum);
    // Union bound over two arm means, fixed final look, bounded Y-theta*X range <= 1+theta.
    let radius =
        |n: usize| (1.0 + theta) * ((4.0_f64 / 0.05).ln() / (2.0 * n.max(1) as f64)).sqrt();
    let delta = means[1] - means[0];
    let width = radius(n[0]) + radius(n[1]);
    json!({"unitsPerArm":n,"normalizedDelta":delta,"finalLook":mature,"minimumMet":enough,
        "interval95":if mature&&enough{json!([delta-width,delta+width])}else{Value::Null},
        "causalUpliftProven":verified_kernel::experiment_result_admissible(mature, enough, delta-width>0.0),
        "method":"fixed-horizon randomized cart units; preregistered CUPED coefficient; Hoeffding union bound",
        "scope":"Net captured cash after completed refunds, capped before normalization; excludes simulation. Not contribution margin; buyer interference and unrecorded returns remain assumptions."})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cannot_claim_effect_before_settlement_or_with_tiny_sample() {
        let v = vec![(0, 0.0), (1, 1.0)];
        assert_eq!(interval(&v, false, 100, 0.0)["causalUpliftProven"], false);
        assert!(interval(&v, true, 100, 0.0)["interval95"].is_null());
    }
    #[test]
    fn final_randomized_separation_can_pass_conservative_bound() {
        let mut v = vec![(0, 0.0); 1000];
        v.extend(vec![(1, 1.0); 1000]);
        assert_eq!(interval(&v, true, 100, 0.0)["causalUpliftProven"], true);
        assert_eq!(interval(&v, false, 100, 0.0)["causalUpliftProven"], false);
    }
}
