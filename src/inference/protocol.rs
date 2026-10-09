//! Self-hosted chat-completions adapter and opt-in provider prompt caching; neither caches private commerce responses.
use super::*;
pub(super) fn chat_request(
    model: &str,
    system: &str,
    user: &str,
    schema: &Value,
    images: &[String],
) -> Value {
    let mut content = vec![json!({"type":"text","text":user})];
    content.extend(
        images
            .iter()
            .map(|url| json!({"type":"image_url","image_url":{"url":url}})),
    );
    json!({"model":model,"stream":false,"temperature":0,"max_tokens":8192,"messages":[{"role":"system","content":system},{"role":"user","content":if images.is_empty(){json!(user)}else{json!(content)}}],"response_format":{"type":"json_schema","json_schema":{"name":"commerce_result","strict":true,"schema":strict_schema(schema.clone())}}})
}
pub(super) fn chat_response(raw: &Value) -> Result<Value, String> {
    let choices = raw["choices"]
        .as_array()
        .filter(|c| c.len() == 1)
        .ok_or("Invalid chat completions result")?;
    if choices[0]["finish_reason"] != "stop" {
        return Err("Chat completion interrupted or truncated".into());
    }
    serde_json::from_str(
        choices[0]["message"]["content"]
            .as_str()
            .ok_or("Chat response lacks text")?,
    )
    .map_err(|_| "Invalid structured chat response".into())
}
pub(super) fn prompt_cache(provider: &Provider, request: &mut Value, system: &str) {
    if env::var("INFERENCE_PROMPT_CACHE").as_deref() != Ok("true") {
        return;
    }
    match provider {
        Provider::Anthropic => {
            request["system"] =
                json!([{"type":"text","text":system,"cache_control":{"type":"ephemeral"}}])
        }
        Provider::Openai if env::var("OPENAI_PROTOCOL").as_deref() != Ok("chat") => {
            use sha2::{Digest, Sha256};
            request["prompt_cache_key"] = json!(format!(
                "vendune-system-{:x}",
                Sha256::digest(system.as_bytes())
            ));
        }
        _ => {}
    }
}
pub(super) fn parse(provider: &Provider, raw: &Value) -> Result<Value, String> {
    let text = match provider {
        Provider::Platform => return Err("Unresolved platform provider".into()),
        Provider::Ollama => {
            if raw["done_reason"] == "length" {
                return Err("Local model output was truncated".into());
            }
            raw["message"]["content"].as_str().map(str::to_string)
        }
        Provider::Anthropic => {
            if raw["stop_reason"] == "max_tokens" {
                return Err("Model output was truncated".into());
            }
            raw["content"].as_array().map(|a| {
                a.iter()
                    .filter(|v| v["type"] == "text")
                    .filter_map(|v| v["text"].as_str())
                    .collect::<String>()
            })
        }
        Provider::Openai => {
            if raw["status"] != "completed" {
                return Err("OpenAI response did not complete".into());
            }
            raw["output"].as_array().map(|a| {
                a.iter()
                    .filter_map(|v| v["content"].as_array())
                    .flatten()
                    .filter(|v| v["type"] == "output_text")
                    .filter_map(|v| v["text"].as_str())
                    .collect::<String>()
            })
        }
    }
    .ok_or("Provider response lacks text")?;
    serde_json::from_str(&text).map_err(|_| "Model did not return valid structured output".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chat_requires_single_completed_structured_result() {
        assert_eq!(
            chat_response(
                &json!({"choices":[{"finish_reason":"stop","message":{"content":"{\"value\":1}"}}]})
            )
            .unwrap(),
            json!({"value":1})
        );
        assert!(
            chat_response(
                &json!({"choices":[{"finish_reason":"length","message":{"content":"{}"}}]})
            )
            .is_err()
        );
        assert!(chat_response(&json!({"choices":[]})).is_err());
    }
}
