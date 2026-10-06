//! Linux container resource readings; unavailable fields stay null on other hosts and the first CPU sample.
use super::*;
use std::sync::{Mutex, OnceLock};
static CPU: OnceLock<Mutex<Option<(std::time::Instant, u64)>>> = OnceLock::new();
fn number(text: &str, key: &str) -> Option<u64> {
    text.lines().find_map(|line| {
        let mut p = line.split_whitespace();
        (p.next() == Some(key))
            .then(|| p.next()?.parse().ok())
            .flatten()
    })
}
pub(super) async fn snapshot() -> Value {
    let read = |path: &'static str| async move { tokio::fs::read_to_string(path).await.ok() };
    let (status, stat, current, limit, quota) = tokio::join!(
        read("/proc/self/status"),
        read("/sys/fs/cgroup/cpu.stat"),
        read("/sys/fs/cgroup/memory.current"),
        read("/sys/fs/cgroup/memory.max"),
        read("/sys/fs/cgroup/cpu.max")
    );
    let usage = stat.as_deref().and_then(|s| number(s, "usage_usec"));
    let cores = quota.as_deref().and_then(|s| {
        let mut p = s.split_whitespace();
        let amount = p.next()?.parse::<f64>().ok()?;
        let period = p.next()?.parse::<f64>().ok()?;
        (period > 0.0).then_some(amount / period)
    });
    let percent = usage.and_then(|value| {
        let now = std::time::Instant::now();
        let mut previous = CPU.get_or_init(|| Mutex::new(None)).lock().unwrap();
        let result = previous.as_ref().and_then(|(at, old)| {
            let seconds = now.duration_since(*at).as_secs_f64();
            (seconds >= 1.0).then(|| {
                100.0 * value.saturating_sub(*old) as f64
                    / 1_000_000.0
                    / seconds
                    / cores.unwrap_or(1.0)
            })
        });
        if previous
            .as_ref()
            .is_none_or(|(at, _)| at.elapsed().as_secs() >= 1)
        {
            *previous = Some((now, value));
        }
        result
    });
    json!({"processResidentBytes":status.as_deref().and_then(|s|number(s,"VmRSS:")).map(|v|v.saturating_mul(1024)),"processThreads":status.as_deref().and_then(|s|number(s,"Threads:")),"containerMemoryBytes":current.and_then(|s|s.trim().parse::<u64>().ok()),"containerMemoryLimitBytes":limit.and_then(|s|s.trim().parse::<u64>().ok()),"containerCpuPercent":percent,"cpuQuotaCores":cores,"cpuUsageMicroseconds":usage,"scope":"Linux cgroup v2 container; CPU normalized by quota when present, otherwise one core; first sample and unsupported hosts are null"})
}
#[cfg(test)]
mod tests {
    #[test]
    fn missing_or_malformed_counters_are_unavailable() {
        assert_eq!(
            super::number("VmRSS: 123 kB\nThreads: 4", "VmRSS:"),
            Some(123)
        );
        assert_eq!(super::number("VmRSS: max", "VmRSS:"), None);
        assert_eq!(super::number("usage_usec 57", "usage_usec"), Some(57));
    }
}
