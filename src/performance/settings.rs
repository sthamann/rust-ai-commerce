//! One MVCC snapshot validates base/override UUIDs; warm reads avoid transmitting or decoding JSON.
use super::*;
pub(crate) async fn settings(a: &App, tenant: &str, channel: &str) -> Result<(Arc<Settings>, i64)> {
    let key = (tenant.to_owned(), channel.to_owned());
    if a.reads.enabled
        && let Some(entry) = MEMO
            .try_with(|memo| memo.borrow().settings.get(&key).cloned())
            .ok()
            .flatten()
    {
        a.reads.memo_hits.fetch_add(1, Ordering::Relaxed);
        return Ok((entry.value.clone(), entry.revision));
    }
    let cached = if a.reads.enabled {
        a.reads.settings.lock().unwrap().get(&key)
    } else {
        None
    };
    let known = cached.as_ref().map(|e| e.version.as_str());
    a.reads.probes.fetch_add(1, Ordering::Relaxed);
    let row = sqlx::query(include_str!("settings.sql"))
        .bind(tenant)
        .bind(channel)
        .bind(known)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Workspace not found".into()))?;
    if !row.get::<bool, _>("channel_exists") {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Sales channel not found".into(),
        ));
    }
    let version: String = row.get("version");
    let revision: i64 = row.get("revision");
    let entry = if let Some(cached) = cached.filter(|e| e.version == version) {
        a.reads.hits.fetch_add(1, Ordering::Relaxed);
        cached
    } else {
        a.reads.loads.fetch_add(1, Ordering::Relaxed);
        let base = commerce::decode_config(row.get("data"))?;
        let patch: Option<Value> = row.get("patch");
        let value = if channel == "default" {
            base
        } else {
            commerce::restore_checkout_data(&base, patch.unwrap_or(json!([])))?
        };
        let weight = serde_json::to_vec(&value)
            .map_err(|_| bad("Invalid settings model"))?
            .len()
            .saturating_mul(3)
            .saturating_add(key.0.len() + key.1.len() + 512);
        let entry = Arc::new(SettingsEntry {
            version,
            value: Arc::new(value),
            revision,
        });
        if a.reads.enabled {
            a.reads
                .settings
                .lock()
                .unwrap()
                .insert(key.clone(), entry.clone(), weight);
        }
        entry
    };
    if a.reads.enabled {
        let _ = MEMO.try_with(|memo| {
            let mut memo = memo.borrow_mut();
            if memo.settings.len() < 8 {
                memo.settings.insert(key, entry.clone());
            }
        });
    }
    Ok((entry.value.clone(), entry.revision))
}
