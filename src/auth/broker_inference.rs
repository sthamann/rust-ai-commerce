//! Trusted server-to-server inference inherits operator settings without disclosing any provider credentials.
use super::email;
use crate::{App, Error, Json, Result, State, StatusCode, Value, bad, json};

pub(crate) async fn generate(State(a): State<App>, Json(v): Json<Value>) -> Result<Json<Value>> {
    let c = super::broker::assertion(&a, "/api/identity/inference", &v).await?;
    let email = email(&c)?;
    let system = c["system"]
        .as_str()
        .filter(|s| s.len() <= 24000)
        .ok_or(bad("Invalid system prompt"))?;
    let user = c["input"]
        .as_str()
        .filter(|s| s.len() <= 24000)
        .ok_or(bad("Invalid model input"))?;
    let images: Vec<String> = serde_json::from_value(c.get("images").cloned().unwrap_or(json!([])))
        .map_err(|_| bad("Invalid images"))?;
    if images.len() > 4
        || images.iter().any(|s| {
            s.len() > 1_500_000
                || ![
                    "data:image/png;base64,",
                    "data:image/jpeg;base64,",
                    "data:image/webp;base64,",
                ]
                .iter()
                .any(|p| s.starts_with(p))
        })
    {
        return Err(bad("At most four bounded PNG/JPEG/WebP images"));
    }
    if !schema_valid(&c["schema"], 0) {
        return Err(bad("Invalid bounded JSON schema"));
    }
    let _permit = a
        .inference_slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| Error(StatusCode::TOO_MANY_REQUESTS, "Model capacity busy".into()))?;
    let count:i32=sqlx::query_scalar("INSERT INTO identity_inference_daily(email,day,calls) VALUES($1,current_date,1) ON CONFLICT(email,day) DO UPDATE SET calls=identity_inference_daily.calls+1 RETURNING calls").bind(email).fetch_one(&a.db).await?;
    if count > 50 {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Daily identity inference allowance reached".into(),
        ));
    }
    let _cluster =
        crate::performance::cluster_lease::Lease::acquire(&a, "__identity", "model", 4).await?;
    let output = a
        .inference
        .structured_with_images(None, system, user, &c["schema"], &images)
        .await
        .map_err(|_| {
            Error(
                StatusCode::BAD_GATEWAY,
                "Configured model could not complete the request".into(),
            )
        })?;
    Ok(Json(
        json!({"value":output.value,"model":output.model,"provider":output.provider,"usage":output.usage}),
    ))
}
fn schema_valid(v: &Value, depth: usize) -> bool {
    if depth > 12 || !v.is_object() || v.get("$ref").is_some() {
        return false;
    }
    match v["type"].as_str() {
        Some("object") => v["properties"]
            .as_object()
            .is_some_and(|p| p.len() <= 40 && p.values().all(|s| schema_valid(s, depth + 1))),
        Some("array") => schema_valid(&v["items"], depth + 1),
        Some("string" | "number" | "integer" | "boolean" | "null") => true,
        _ => false,
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_schema_cannot_panic_provider_adapter() {
        assert!(!schema_valid(&json!({"type":"object"}), 0));
        assert!(!schema_valid(
            &json!({"$ref":"http://private/","type":"string"}),
            0
        ));
        assert!(schema_valid(
            &json!({"type":"object","properties":{"title":{"type":"string"}}}),
            0
        ));
    }
}
