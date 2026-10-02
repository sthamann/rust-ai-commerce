//! Integer-cent proportional discount allocation; cumulative rounding conserves the exact basket discount.
/// Return discounted line totals in cents. Target is clamped to available positive goods value.
pub fn allocate(totals: &[i64], discount: i64) -> Vec<i64> {
    let total: i64 = totals.iter().map(|n| (*n).max(0)).sum();
    if total == 0 {
        return totals.to_vec();
    }
    let target = crate::verified_kernel::discount_cap(total as u64, discount.max(0) as u64) as i128;
    let mut cumulative = 0i128;
    let mut allocated = 0i128;
    totals
        .iter()
        .map(|n| {
            cumulative += (*n).max(0) as i128;
            let next = (cumulative * target + total as i128 / 2) / total as i128;
            let result = *n - (next - allocated) as i64;
            allocated = next;
            result
        })
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_cents_no_negative_lines() {
        for items in [vec![1, 1, 1], vec![2490, 2990, 7490], vec![0, 1, 999999]] {
            for discount in 0..=items.iter().sum::<i64>() + 1 {
                let result = allocate(&items, discount);
                assert!(result.iter().all(|v| *v >= 0));
                assert_eq!(
                    result.iter().sum::<i64>(),
                    (items.iter().sum::<i64>() - discount).max(0)
                );
            }
        }
    }
}
