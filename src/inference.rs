//! Provider adapters. Credentials stay on the server; domain validation is separate.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::env;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Ollama,
    Openai,
    Anthropic,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Choice {
    #[serde(default)]
    pub provider: Provider,
    pub model: Option<String>,
}
#[derive(Clone)]
pub struct Inference {
    http: reqwest::Client,
    ollama: String,
    local_model: String,
    openai_url: String,
    openai_key: Option<String>,
    openai_model: String,
    anthropic_url: String,
    anthropic_key: Option<String>,
    anthropic_model: String,
}
pub struct Output {
    pub value: Value,
    pub model: String,
    pub provider: Provider,
    pub usage: Value,
}
impl Inference {
    pub fn from_env(http: reqwest::Client) -> Self {
        let key = |name| env::var(name).ok().filter(|s| !s.is_empty());
        Self {
            http,
            ollama: env::var("OLLAMA_URL").unwrap_or("http://127.0.0.1:11434".into()),
            local_model: env::var("OLLAMA_MODEL").unwrap_or("qwen3.6:35b".into()),
            openai_url: env::var("OPENAI_BASE_URL").unwrap_or("https://api.openai.com/v1".into()),
            openai_key: key("OPENAI_API_KEY"),
            openai_model: env::var("OPENAI_MODEL").unwrap_or("gpt-6-sol".into()),
            anthropic_url: env::var("ANTHROPIC_BASE_URL")
                .unwrap_or("https://api.anthropic.com/v1".into()),
            anthropic_key: key("ANTHROPIC_API_KEY"),
            anthropic_model: env::var("ANTHROPIC_MODEL").unwrap_or("claude-sonnet-5-5".into()),
        }
    }
    pub fn providers(&self) -> Value {
        json!({"providers":[
            {"id":"ollama","name":"Local / open weights","model":self.local_model,"configured":true},
            {"id":"openai","name":"OpenAI","model":self.openai_model,"configured":self.openai_key.is_some()},
            {"id":"anthropic","name":"Claude","model":self.anthropic_model,"configured":self.anthropic_key.is_some()}
        ],"credentials":"server-environment-only"})
    }
    pub async fn structured(
        &self,
        choice: Option<&Choice>,
        system: &str,
        user: &str,
        schema: &Value,
    ) -> Result<Output, String> {
        let provider = choice.map(|c| c.provider.clone()).unwrap_or_default();
        let default_model = match provider {
            Provider::Ollama => &self.local_model,
            Provider::Openai => &self.openai_model,
            Provider::Anthropic => &self.anthropic_model,
        };
        let model = choice
            .and_then(|c| c.model.as_ref())
            .unwrap_or(default_model);
        if model.is_empty()
            || model.len() > 128
            || !model.is_ascii()
            || model.chars().any(char::is_control)
        {
            return Err("Invalid model identifier".into());
        }
        let (request, path) = match provider {
            Provider::Ollama => (
                json!({"model":model,"stream":false,"think":false,"format":schema,"options":{"temperature":0,"num_predict":2000},"messages":[{"role":"system","content":system},{"role":"user","content":user}]}),
                format!("{}/api/chat", self.ollama.trim_end_matches('/')),
            ),
            Provider::Openai => (
                json!({"model":model,"store":false,"instructions":system,"input":user,"max_output_tokens":8192,"text":{"format":{"type":"json_schema","name":"commerce_result","strict":true,"schema":strict_schema(schema.clone())}}}),
                format!("{}/responses", self.openai_url.trim_end_matches('/')),
            ),
            Provider::Anthropic => (
                json!({"model":model,"max_tokens":8192,"system":system,"messages":[{"role":"user","content":user}],"output_config":{"format":{"type":"json_schema","schema":schema}}}),
                format!("{}/messages", self.anthropic_url.trim_end_matches('/')),
            ),
        };
        let mut req = self.http.post(path).json(&request);
        req = match provider {
            Provider::Ollama => req,
            Provider::Openai => req.bearer_auth(
                self.openai_key
                    .as_ref()
                    .ok_or("OpenAI is not configured: set OPENAI_API_KEY on the server")?,
            ),
            Provider::Anthropic => req
                .header(
                    "x-api-key",
                    self.anthropic_key
                        .as_ref()
                        .ok_or("Claude is not configured: set ANTHROPIC_API_KEY on the server")?,
                )
                .header("anthropic-version", "2023-06-01"),
        };
        let response = req
            .send()
            .await
            .map_err(|_| "Model service unavailable".to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Model service rejected the request (HTTP {})",
                response.status().as_u16()
            ));
        }
        let raw: Value = response
            .json()
            .await
            .map_err(|_| "Invalid provider response")?;
        let value = parse(&provider, &raw)?;
        Ok(Output {
            value,
            model: model.clone(),
            provider,
            usage: raw
                .get("usage")
                .cloned()
                .unwrap_or_else(|| json!({"output_tokens":raw["eval_count"]})),
        })
    }
}
// OpenAI requires all properties to be required; optional fields become nullable.
fn strict_schema(mut v: Value) -> Value {
    if let Some(items) = v.get_mut("items") {
        *items = strict_schema(items.clone());
    }
    if v["type"] == "object" {
        let required = v["required"].as_array().cloned().unwrap_or_default();
        let properties = v["properties"].as_object_mut().unwrap();
        for (name, value) in properties.iter_mut() {
            *value = strict_schema(value.clone());
            if !required.contains(&json!(name)) {
                *value = json!({"anyOf":[value.clone(),{"type":"null"}]});
            }
        }
        let names = properties.keys().cloned().collect::<Vec<_>>();
        v["required"] = json!(names);
        v["additionalProperties"] = json!(false);
    }
    v
}
fn parse(provider: &Provider, raw: &Value) -> Result<Value, String> {
    let text = match provider {
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
    fn provider_protocols_and_incomplete_output() {
        assert!(
            parse(
                &Provider::Ollama,
                &json!({"done_reason":"length","message":{"content":"{}"}})
            )
            .is_err()
        );
        assert_eq!(parse(&Provider::Openai,&json!({"status":"completed","output":[{"type":"reasoning"},{"content":[{"type":"output_text","text":"{\"answer\":1}"}]}]})).unwrap(),json!({"answer":1}));
        assert_eq!(parse(&Provider::Anthropic,&json!({"content":[{"type":"thinking","thinking":"private"},{"type":"text","text":"{\"answer\":2}"}]})).unwrap(),json!({"answer":2}));
        assert!(
            parse(
                &Provider::Openai,
                &json!({"status":"incomplete","output":[]})
            )
            .is_err()
        );
        assert!(
            parse(
                &Provider::Anthropic,
                &json!({"stop_reason":"max_tokens","content":[]})
            )
            .is_err()
        );
    }
    #[test]
    fn optional_nested_schema_is_nullable_and_required() {
        let schema = strict_schema(
            json!({"type":"object","properties":{"change":{"type":"object","properties":{"price":{"type":"number"}},"required":[]}},"required":[]}),
        );
        assert_eq!(schema["required"], json!(["change"]));
        assert_eq!(
            schema["properties"]["change"]["anyOf"][0]["required"],
            json!(["price"])
        );
    }
}
