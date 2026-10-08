//! One dedicated LISTEN connection per worker process. Commit notifications are hints; polling repairs lost hints.
use std::sync::{Arc, OnceLock};
use tokio::sync::broadcast;
static SIGNAL: OnceLock<broadcast::Sender<()>> = OnceLock::new();
pub(crate) struct Wakeup {
    rx: broadcast::Receiver<()>,
    fast_until: std::time::Instant,
}
pub(crate) fn subscribe() -> Wakeup {
    let sender = SIGNAL.get_or_init(|| broadcast::channel(64).0);
    Wakeup {
        rx: sender.subscribe(),
        fast_until: std::time::Instant::now(),
    }
}
impl Wakeup {
    pub(crate) fn worked(&mut self, worked: bool) {
        if worked {
            self.fast_until = std::time::Instant::now() + std::time::Duration::from_secs(10);
        }
    }
    pub(crate) async fn tick(&mut self) {
        let delay = if std::time::Instant::now() < self.fast_until {
            250
        } else {
            5000
        };
        tokio::select! {
            _=tokio::time::sleep(std::time::Duration::from_millis(delay))=>{},
            _=self.rx.recv()=>{self.fast_until=std::time::Instant::now()+std::time::Duration::from_secs(10);},
        }
    }
}
pub(crate) fn start(db_url: Arc<String>) {
    let sender = SIGNAL.get_or_init(|| broadcast::channel(64).0).clone();
    vendune::tenant_scope::spawn(async move {
        loop {
            let result = async {
                let mut listener = sqlx::postgres::PgListener::connect(&db_url).await?;
                listener.listen("vendune_work_ready").await?;
                // Drain preexisting jobs on startup/reconnection, before relying on commit hints.
                let _ = sender.send(());
                loop {
                    listener.recv().await?;
                    let _ = sender.send(());
                }
                #[allow(unreachable_code)]
                Ok::<(), sqlx::Error>(())
            }
            .await;
            if result.is_err() {
                eprintln!("worker_notifications_unavailable: bounded polling continues");
            }
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });
}
