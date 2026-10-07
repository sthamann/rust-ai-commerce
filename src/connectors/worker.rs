//! Distributed delivery workers fence settings and leases, retry only proven rejection, and drain on shutdown.
use super::*;
pub async fn once(store: &Store, a: &str) -> Result<bool> {
    let Some(job) = store.claim(a).await? else {
        return Ok(false);
    };
    let result = tokio::time::timeout(Duration::from_secs(60), perform(store, &job))
        .await
        .unwrap_or(Err(Error::Uncertain));
    let (state, result, delay) = match result {
        Ok(v) => ("completed", v, 0),
        Err(Error::Http(code, retry)) => {
            let retryable = crate::verified_kernel::notification_retry_admissible(
                code == 429,
                job.attempts as u64,
            );
            (
                if retryable {
                    "queued"
                } else if ["email", "slack"].contains(&a) && !(400..500).contains(&code) {
                    "uncertain"
                } else {
                    "failed"
                },
                json!({"error":format!("Provider HTTP {code}")}),
                retry,
            )
        }
        Err(Error::Uncertain) => (
            "uncertain",
            json!({"error":"Provider outcome not confirmed; no automatic resend"}),
            0,
        ),
        Err(Error::Conflict) => (
            "queued",
            json!({"error":"Connection configuration busy; no provider attempt"}),
            1,
        ),
        Err(Error::Database) => (
            "uncertain",
            json!({"error":"Database interrupted; no automatic resend"}),
            0,
        ),
        Err(_) => (
            "failed",
            json!({"error":"Provider operation rejected; verify connection and settings"}),
            0,
        ),
    };
    store.finish(&job, state, &result, delay).await?;
    Ok(true)
}
async fn perform(store: &Store, j: &queue::Job) -> Result<Value> {
    if j.app == "email" {
        let mut tx = store.tx(&j.tenant).await?;
        store.lock(&mut tx, &j.tenant, &j.app).await?;
        let current = store.get_tx(&mut tx, &j.tenant, &j.app).await?;
        let s = config::parse(&current["settings"])?;
        checked(
            current["revision"] == j.payload["revision"] && s.enabled,
            "Email configuration changed or disabled",
        )?;
        let c = config::credentials(current.get("credentials").unwrap_or(&json!({})))?;
        let result = email::deliver(&s, &c, j).await;
        tx.commit().await?;
        return result;
    }
    let settings = store.get(&j.tenant, &j.app).await?["settings"].clone();
    match j.app.as_str() {
        "slack" => providers::slack(store, &j.tenant, &j.payload, &settings).await,
        "gmail" => providers::gmail(store, &j.tenant, &settings).await,
        _ => providers::analytics(store, &j.tenant, &settings).await,
    }
}
pub async fn loop_worker(
    store: Store,
    app: &'static str,
    mut stop: tokio::sync::watch::Receiver<bool>,
) {
    loop {
        if *stop.borrow() {
            break;
        }
        let _ = store.recover().await;
        match once(&store, app).await {
            Ok(true) => continue,
            _ => {
                tokio::select! {_=stop.changed()=>{},_=tokio::time::sleep(Duration::from_millis(250))=>{}}
            }
        }
    }
}
