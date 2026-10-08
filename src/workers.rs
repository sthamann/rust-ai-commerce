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
            "translation-worker",
            "media-worker"
        ]
        .contains(&role.as_str()),
        "Unsupported PROCESS_ROLE"
    );
    if role != "http" {
        work_signal::start(Arc::new(runtime_config::get().listener_url.clone()));
    }
    if ["all", "translation-worker"].contains(&role.as_str()) {
        let worker = a.clone();
        vendune::tenant_scope::spawn(async move {
            let mut ticks = work_signal::subscribe();
            loop {
                ticks.tick().await;
                match translations::once(&worker).await {
                    Ok(worked) => ticks.worked(worked),
                    Err(e) => eprintln!("translation worker: {}", e.1),
                }
            }
        });
    }
    if ["all", "media-worker"].contains(&role.as_str()) {
        let worker = a.clone();
        vendune::tenant_scope::spawn(async move {
            let mut ticks = work_signal::subscribe();
            loop {
                ticks.tick().await;
                match assets::image_once(&worker).await {
                    Ok(worked) => ticks.worked(worked),
                    Err(e) => eprintln!("image worker: {}", e.1),
                }
            }
        });
    }
    if ["all", "http"].contains(&role.as_str()) {
        let worker = a.clone();
        vendune::tenant_scope::spawn(async move {
            let mut ticks = tokio::time::interval(std::time::Duration::from_secs(1));
            loop {
                ticks.tick().await;
                worker.channel_metrics.flush(&worker.db).await;
            }
        });
    }
    if ["all", "memory-worker"].contains(&role.as_str()) {
        let worker = a.clone();
        vendune::tenant_scope::spawn(async move {
            let mut ticks = work_signal::subscribe();
            loop {
                ticks.tick().await;
                match consume_once(&worker).await {
                    Ok(worked) => ticks.worked(worked),
                    Err(e) => eprintln!("memory/outbox worker: {}", e.1),
                }
            }
        });
    }
    if ["all", "payment-worker"].contains(&role.as_str()) {
        let worker = a.clone();
        vendune::tenant_scope::spawn(async move {
            let mut ticks = work_signal::subscribe();
            loop {
                ticks.tick().await;
                match payments::payment_once(&worker).await {
                    Ok(worked) => ticks.worked(worked),
                    Err(e) => eprintln!("payment worker: {}", e.1),
                }
            }
        });
    }
    if ["all", "app-worker"].contains(&role.as_str()) {
        let collector = a.clone();
        vendune::tenant_scope::spawn(async move {
            let mut ticks = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                ticks.tick().await;
                let _ = apps::collect_sources(&collector).await;
                if let Err(e) = apps::schedule_once(&collector).await {
                    eprintln!("app scheduler: {}", e.1);
                }
            }
        });
        let worker = a.clone();
        vendune::tenant_scope::spawn(async move {
            let mut ticks = work_signal::subscribe();
            loop {
                ticks.tick().await;
                match marketing::flow_once(&worker).await {
                    Ok(worked) => ticks.worked(worked),
                    Err(e) => eprintln!("flow worker: {}", e.1),
                }
                match apps::deliver_once(&worker).await {
                    Ok(worked) => ticks.worked(worked),
                    Err(e) => eprintln!("app worker: {}", e.1),
                }
            }
        });
    }
}
