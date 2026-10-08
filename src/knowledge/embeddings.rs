//! Bounded batched embeddings: Ollama and OpenAI-compatible self-hosted endpoints, model-defined dimensions.
use super::*;
/// Reject malformed vectors before SQL/Qdrant; dimensions belong to the embedding model.
pub fn valid(vector: &[f32]) -> bool {
    (1..=8192).contains(&vector.len())
        && vector.iter().all(|v| v.is_finite())
        && vector.iter().any(|v| *v != 0.)
}
pub async fn embedding(
    http: &reqwest::Client,
    url: &str,
    key: Option<&str>,
    model: &str,
    text: &str,
) -> Result<Vec<f32>, String> {
    batch(http, url, key, model, &[text.to_owned()])
        .await?
        .pop()
        .ok_or("Missing embedding".into())
}
pub async fn batch(
    http: &reqwest::Client,
    url: &str,
    key: Option<&str>,
    model: &str,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    if texts.is_empty() || texts.len() > 32 || texts.iter().any(|t| t.len() > 65536) {
        return Err("Embedding batch exceeds limits".into());
    }
    let configured_url = std::env::var("EMBEDDING_BASE_URL").ok();
    let url = configured_url.as_deref().unwrap_or(url);
    let configured_key = std::env::var("EMBEDDING_API_KEY").ok();
    let key = configured_key.as_deref().or(key);
    let openai = std::env::var("EMBEDDING_PROTOCOL").as_deref() == Ok("openai");
    let path = if openai { "embeddings" } else { "api/embed" };
    let body = if openai {
        json!({"model":model,"input":texts,"encoding_format":"float"})
    } else {
        json!({"model":model,"input":texts,"truncate":false})
    };
    let mut request = http
        .post(format!("{}/{path}", url.trim_end_matches('/')))
        .json(&body)
        .timeout(std::time::Duration::from_secs(30));
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Embedding service unavailable")?;
    if !response.status().is_success() {
        return Err(format!(
            "Embedding service rejected request (HTTP {})",
            response.status()
        ));
    }
    let raw = crate::http_json::bounded(response, 8 * 1024 * 1024).await?;
    let value = if openai {
        let mut data = raw["data"]
            .as_array()
            .ok_or("Missing embedding data")?
            .clone();
        data.sort_by_key(|v| v["index"].as_u64());
        if data
            .iter()
            .enumerate()
            .any(|(i, v)| v["index"].as_u64() != Some(i as u64))
        {
            return Err("Invalid embedding indexes".into());
        }
        json!(
            data.into_iter()
                .map(|v| v["embedding"].clone())
                .collect::<Vec<_>>()
        )
    } else {
        raw["embeddings"].clone()
    };
    let vectors: Vec<Vec<f32>> =
        serde_json::from_value(value).map_err(|_| "Invalid embedding vectors")?;
    validate_batch(&vectors, texts.len())?;
    Ok(vectors)
}
fn validate_batch(vectors: &[Vec<f32>], count: usize) -> Result<(), String> {
    if vectors.len() != count
        || vectors
            .iter()
            .any(|v| !valid(v) || v.len() != vectors[0].len())
    {
        return Err("Embedding cardinality/dimensions mismatch".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dimensions_follow_model_and_malformed_batches_fail() {
        assert!(validate_batch(&[vec![1.; 384], vec![2.; 384]], 2).is_ok());
        assert!(validate_batch(&[vec![1.; 1536]], 1).is_ok());
        assert!(validate_batch(&[vec![1.; 3]], 2).is_err());
        assert!(validate_batch(&[vec![1.; 3], vec![1.; 4]], 2).is_err());
        assert!(!valid(&[f32::NAN]));
        assert!(!valid(&[]));
    }
}
