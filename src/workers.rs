//! Independently deployable worker roles; leases and durable receipts coordinate replicas.
use crate::*;
pub(crate) fn start(a: &App) {
    let role = env::var("PROCESS_ROLE").unwrap_or("all".into());
    assert!(
        [
            "all",
            "http",
            "memory-worker",
            "payment-worker",
            "app-worker",
            "translation-worker"
        ]
        .contains(&role.as_str()),
        "Unsupported PROCESS_ROLE"
    );
    if ["all", "translation-worker"].contains(&role.as_str()) {
        let worker = a.clone();
        tokio::spawn(async move {
            let mut ticks = tokio::time::interval(std::time::Duration::from_secs(1));
            loop {
                ticks.tick().await;
                if let Err(e) = translations::once(&worker).await {
                    eprintln!("translation worker: {}", e.1);
                }
            }
        });
    }
    if ["all", "http"].contains(&role.as_str()) {
        let worker = a.clone();
        tokio::spawn(async move {
            let mut ticks = tokio::time::interval(std::time::Duration::from_secs(1));
            loop {
                ticks.tick().await;
                worker.channel_metrics.flush(&worker.db).await;
            }
        });
    }
    if ["all", "memory-worker"].contains(&role.as_str()) {
        let worker = a.clone();
        tokio::spawn(async move {
            let mut ticks = tokio::time::interval(std::time::Duration::from_millis(250));
            loop {
                ticks.tick().await;
                if let Err(e) = consume_once(&worker).await {
                    eprintln!("memory/outbox worker: {}", e.1);
                }
            }
        });
    }
    if ["all", "payment-worker"].contains(&role.as_str()) {
        let worker = a.clone();
        tokio::spawn(async move {
            let mut ticks = tokio::time::interval(std::time::Duration::from_millis(250));
            loop {
                ticks.tick().await;
                if let Err(e) = payments::payment_once(&worker).await {
                    eprintln!("payment worker: {}", e.1);
                }
            }
        });
    }
    if ["all", "app-worker"].contains(&role.as_str()) {
        let collector = a.clone();
        tokio::spawn(async move {
            let mut ticks = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                ticks.tick().await;
                let _ = apps::collect_sources(&collector).await;
            }
        });
        let worker = a.clone();
        tokio::spawn(async move {
            let mut ticks = tokio::time::interval(std::time::Duration::from_millis(250));
            loop {
                ticks.tick().await;
                if let Err(e) = marketing::flow_once(&worker).await {
                    eprintln!("flow worker: {}", e.1);
                }
                if let Err(e) = apps::deliver_once(&worker).await {
                    eprintln!("app worker: {}", e.1);
                }
            }
        });
    }
}
