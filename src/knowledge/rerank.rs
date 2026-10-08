//! Optional TEI cross-encoder reranking on at most 24 tenant-hydrated texts; malformed or unavailable providers retain fused ordering.
use super::*;
pub async fn apply(tenant: &str, query: &str, hits: &mut [Value], db: &PgPool) -> bool {
    let Ok(url) = std::env::var("RERANKER_URL") else {
        return false;
    };
    if hits.is_empty() {
        return false;
    }
    let ids = hits
        .iter()
        .filter_map(|v| v["id"].as_str())
        .collect::<Vec<_>>();
    let Ok(rows) =
        sqlx::query("SELECT id,name,description FROM products WHERE tenant=$1 AND id=ANY($2)")
            .bind(tenant)
            .bind(ids)
            .fetch_all(db)
            .await
    else {
        return false;
    };
    let texts = hits
        .iter()
        .map(|hit| {
            rows.iter()
                .find(|r| Some(r.get::<&str, _>("id")) == hit["id"].as_str())
                .map(|r| {
                    format!(
                        "{} {}",
                        r.get::<&str, _>("name"),
                        r.get::<&str, _>("description")
                    )
                    .chars()
                    .take(4000)
                    .collect::<String>()
                })
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    let http = CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("Reranker HTTP client")
    });
    let mut request = http
        .post(format!("{}/rerank", url.trim_end_matches('/')))
        .json(&json!({"query":query,"texts":texts,"raw_scores":false}));
    if let Ok(key) = std::env::var("RERANKER_API_KEY") {
        request = request.bearer_auth(key);
    }
    let Ok(response) = request.send().await else {
        return false;
    };
    if !response.status().is_success() {
        return false;
    }
    let Ok(value) = crate::http_json::bounded(response, 65536).await else {
        return false;
    };
    let Ok(scores) = validate(&value, hits.len()) else {
        return false;
    };
    for (hit, score) in hits.iter_mut().zip(scores) {
        hit["rerankScore"] = json!(score);
    }
    hits.sort_by(|a, b| {
        b["rerankScore"]
            .as_f64()
            .unwrap()
            .total_cmp(&a["rerankScore"].as_f64().unwrap())
    });
    true
}
fn validate(value: &Value, count: usize) -> Result<Vec<f64>, ()> {
    let rows = value.as_array().filter(|v| v.len() == count).ok_or(())?;
    let mut scores = vec![None; count];
    for row in rows {
        let i = row["index"].as_u64().ok_or(())? as usize;
        let score = row["score"].as_f64().filter(|v| v.is_finite()).ok_or(())?;
        if i >= count || scores[i].is_some() {
            return Err(());
        }
        scores[i] = Some(score);
    }
    scores.into_iter().map(|v| v.ok_or(())).collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reranking_rejects_duplicate_missing_or_outside_candidates() {
        assert_eq!(
            validate(&json!([{"index":1,"score":0.9},{"index":0,"score":0.1}]), 2).unwrap(),
            vec![0.1, 0.9]
        );
        assert!(validate(&json!([{"index":0,"score":1},{"index":0,"score":2}]), 2).is_err());
        assert!(validate(&json!([{"index":2,"score":1}]), 1).is_err());
        assert!(validate(&json!([]), 1).is_err());
    }
}
