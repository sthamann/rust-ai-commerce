//! Global language registry is versioned in the same transaction as every registry mutation.
use super::*;
#[derive(Clone, Deserialize)]
pub(crate) struct LanguageRow {
    pub id: String,
    pub locale: String,
    pub parent_id: Option<String>,
}
pub(crate) async fn languages(a: &App) -> Result<Arc<Vec<LanguageRow>>> {
    if a.reads.enabled
        && let Some(entry) = MEMO
            .try_with(|memo| memo.borrow().languages.clone())
            .ok()
            .flatten()
    {
        a.reads.memo_hits.fetch_add(1, Ordering::Relaxed);
        return Ok(entry.rows.clone());
    }
    let cached = if a.reads.enabled {
        a.reads.languages.lock().unwrap().get(&())
    } else {
        None
    };
    a.reads.probes.fetch_add(1, Ordering::Relaxed);
    let row = sqlx::query("SELECT version::text AS version,CASE WHEN version::text IS DISTINCT FROM $1 THEN (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY locale),'[]'::jsonb) FROM (SELECT id,locale,parent_id FROM languages) l) END AS data FROM read_context_versions WHERE namespace='languages'")
        .bind(cached.as_ref().map(|e| e.version.as_str())).fetch_one(&a.db).await?;
    let version: String = row.get("version");
    let entry = if let Some(cached) = cached.filter(|e| e.version == version) {
        a.reads.hits.fetch_add(1, Ordering::Relaxed);
        cached
    } else {
        a.reads.loads.fetch_add(1, Ordering::Relaxed);
        let data: Value = row.get("data");
        let weight = data.to_string().len().saturating_mul(3);
        let rows = serde_json::from_value(data).map_err(|_| bad("Invalid language registry"))?;
        let entry = Arc::new(LanguageEntry {
            version,
            rows: Arc::new(rows),
        });
        if a.reads.enabled {
            a.reads
                .languages
                .lock()
                .unwrap()
                .insert((), entry.clone(), weight);
        }
        entry
    };
    if a.reads.enabled {
        let _ = MEMO.try_with(|memo| memo.borrow_mut().languages = Some(entry.clone()));
    }
    Ok(entry.rows.clone())
}
