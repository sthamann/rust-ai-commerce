//! One monotonic provider-neutral ledger state machine; evidence validation and authorization stay in receipt adapters.
use crate::{Result, conflict, verified_kernel};

fn code(state: &str) -> Option<u64> {
    [
        "pending",
        "ready",
        "approved",
        "authorized",
        "captured",
        "partially_refunded",
        "refunded",
        "cancelled",
        "expired",
        "captured_late",
    ]
    .iter()
    .position(|s| *s == state)
    .map(|n| n as u64)
}
pub(crate) fn transition(current: &str, next: &str) -> Result<()> {
    let admitted = code(current)
        .zip(code(next))
        .is_some_and(|(current, next)| {
            verified_kernel::payment_transition_admissible(current, next)
        });
    if admitted {
        Ok(())
    } else {
        Err(conflict("Invalid payment ledger transition"))
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_receipts_never_regress_and_late_capture_has_an_explicit_refund_path() {
        for current in [
            "captured",
            "partially_refunded",
            "refunded",
            "captured_late",
        ] {
            for next in [
                "pending",
                "ready",
                "approved",
                "authorized",
                "cancelled",
                "expired",
            ] {
                assert!(transition(current, next).is_err());
            }
        }
        assert!(transition("cancelled", "captured_late").is_ok());
        assert!(transition("captured_late", "refunded").is_ok());
        assert!(transition("pending", "captured").is_ok());
        assert!(transition("approved", "ready").is_err());
        assert!(transition("unknown", "unknown").is_err());
    }
}
