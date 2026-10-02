//! Bounded streaming responses for extension services and payment providers.
use super::*;
pub(crate) async fn json_body(mut r: reqwest::Response) -> Result<Value> {
    let mut bytes = Vec::new();
    while let Some(chunk) = r
        .chunk()
        .await
        .map_err(|_| bad("Invalid remote response"))?
    {
        if bytes.len() + chunk.len() > 65536 {
            return Err(bad("Remote response exceeds limit"));
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| bad("Invalid remote JSON response"))
}
