//! Bound untrusted provider JSON before allocation/deserialization; connection pooling remains with each existing service owner.
use serde_json::Value;
pub async fn bounded(mut response: reqwest::Response, limit: usize) -> Result<Value, String> {
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err("Provider response exceeds byte limit".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Provider response interrupted")?
    {
        if data.len().saturating_add(chunk.len()) > limit {
            return Err("Provider response exceeds byte limit".into());
        }
        data.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&data).map_err(|_| "Invalid provider JSON".into())
}
