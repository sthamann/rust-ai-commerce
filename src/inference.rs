//! Provider adapters. Credentials stay on the server; domain validation is separate.
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::env;
mod protocol;
pub mod settings;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    #[default]
    Platform,
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
    db: Option<crate::scoped_pool::ScopedPool>,
    settings: std::sync::Arc<tokio::sync::Mutex<Option<(std::time::Instant, Value)>>>,
    default_provider: Provider,
    disabled: Vec<String>,
    ollama_key: Option<String>,
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
            db: None,
            settings: Default::default(),
            default_provider: Provider::Ollama,
            disabled: vec![],
            ollama_key: None,
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
        let current = match self.default_provider {
            Provider::Openai => &self.openai_model,
            Provider::Anthropic => &self.anthropic_model,
            _ => &self.local_model,
        };
        let configured = match self.default_provider {
            Provider::Openai => self.openai_key.is_some(),
            Provider::Anthropic => self.anthropic_key.is_some(),
            _ => true,
        } && !self.disabled.iter().any(|v| {
            Some(v.as_str())
                == serde_json::to_value(&self.default_provider)
                    .unwrap()
                    .as_str()
        });
        json!({"providers":[
            {"id":"platform","name":"Platform default","model":current,"configured":configured},
            {"id":"ollama","name":"Local / open weights","model":self.local_model,"configured":!self.disabled.iter().any(|v|v=="ollama")},
            {"id":"openai","name":"OpenAI","model":self.openai_model,"configured":self.openai_key.is_some() && !self.disabled.iter().any(|v|v=="openai")},
            {"id":"anthropic","name":"Claude","model":self.anthropic_model,"configured":self.anthropic_key.is_some() && !self.disabled.iter().any(|v|v=="anthropic")}
        ],"defaultProvider":self.default_provider,"credentials":"platform-inherited-server-only"})
    }
    pub async fn structured(
        &self,
        choice: Option<&Choice>,
        system: &str,
        user: &str,
        schema: &Value,
    ) -> Result<Output, String> {
        let runtime = self.resolved().await?;
        runtime
            .structured_resolved(choice, system, user, schema, &[])
            .await
    }
    /// Route tasks through the resolved central provider; an explicit caller model always wins.
    pub async fn structured_for(
        &self,
        task: &str,
        choice: Option<&Choice>,
        system: &str,
        user: &str,
        schema: &Value,
    ) -> Result<Output, String> {
        if !["planner", "extraction", "concierge"].contains(&task) {
            return Err("Unknown inference task".into());
        }
        let runtime = self.resolved().await?;
        let provider = match choice.map(|c| c.provider.clone()) {
            Some(Provider::Platform) | None => runtime.default_provider.clone(),
            Some(p) => p,
        };
        let suffix = serde_json::to_value(&provider)
            .unwrap()
            .as_str()
            .unwrap()
            .to_uppercase();
        let mut routed = choice.cloned().unwrap_or(Choice {
            provider: provider.clone(),
            model: None,
        });
        if (routed.model.is_none() || matches!(routed.provider, Provider::Platform))
            && let Ok(model) = env::var(format!(
                "INFERENCE_MODEL_{}_{}",
                task.to_uppercase(),
                suffix
            ))
        {
            routed = Choice {
                provider,
                model: Some(model),
            };
        }
        runtime
            .structured_resolved(Some(&routed), system, user, schema, &[])
            .await
    }
    /// Multimodal input uses the same centrally inherited settings and bounded provider output.
    pub async fn structured_with_images(
        &self,
        choice: Option<&Choice>,
        system: &str,
        user: &str,
        schema: &Value,
        images: &[String],
    ) -> Result<Output, String> {
        self.resolved()
            .await?
            .structured_resolved(choice, system, user, schema, images)
            .await
    }
    async fn structured_resolved(
        &self,
        choice: Option<&Choice>,
        system: &str,
        user: &str,
        schema: &Value,
        images: &[String],
    ) -> Result<Output, String> {
        let provider = match choice.map(|c| c.provider.clone()) {
            Some(Provider::Platform) | None => self.default_provider.clone(),
            Some(value) => value,
        };
        let id = serde_json::to_value(&provider).unwrap();
        if self
            .disabled
            .iter()
            .any(|v| Some(v.as_str()) == id.as_str())
        {
            return Err("Provider disabled by platform operator".into());
        }
        let default_model = match provider {
            Provider::Ollama => &self.local_model,
            Provider::Openai => &self.openai_model,
            Provider::Anthropic => &self.anthropic_model,
            Provider::Platform => return Err("Invalid platform provider".into()),
        };
        let model = choice
            .filter(|c| !matches!(c.provider, Provider::Platform))
            .and_then(|c| c.model.as_ref())
            .unwrap_or(default_model);
        if model.is_empty()
            || model.len() > 128
            || !model.is_ascii()
            || model.chars().any(char::is_control)
        {
            return Err("Invalid model identifier".into());
        }
        let mut visual = vec![json!({"type":"input_text","text":user})];
        visual.extend(
            images
                .iter()
                .map(|s| json!({"type":"input_image","image_url":s})),
        );
        let mut claude = vec![json!({"type":"text","text":user})];
        for image in images {
            let (mime, data) = image
                .strip_prefix("data:")
                .and_then(|s| s.split_once(";base64,"))
                .ok_or("Invalid image data")?;
            claude.push(
                json!({"type":"image","source":{"type":"base64","media_type":mime,"data":data}}),
            );
        }
        let (mut request, path) = match provider {
            Provider::Platform => return Err("Invalid platform provider".into()),
            Provider::Ollama => (
                json!({"model":model,"stream":false,"think":false,"format":schema,"options":{"temperature":0,"num_predict":2000},"messages":[{"role":"system","content":system},{"role":"user","content":user,"images":images.iter().filter_map(|s|s.split_once(";base64,").map(|(_,b)|b)).collect::<Vec<_>>()}]}),
                format!("{}/api/chat", self.ollama.trim_end_matches('/')),
            ),
            Provider::Openai if env::var("OPENAI_PROTOCOL").as_deref() == Ok("chat") => (
                protocol::chat_request(model, system, user, schema, images),
                format!("{}/chat/completions", self.openai_url.trim_end_matches('/')),
            ),
            Provider::Openai => (
                json!({"model":model,"store":false,"instructions":system,"input":if images.is_empty(){json!(user)}else{json!([{"role":"user","content":visual}])},"max_output_tokens":8192,"text":{"format":{"type":"json_schema","name":"commerce_result","strict":true,"schema":strict_schema(schema.clone())}}}),
                format!("{}/responses", self.openai_url.trim_end_matches('/')),
            ),
            Provider::Anthropic => (
                json!({"model":model,"max_tokens":8192,"system":system,"messages":[{"role":"user","content":if images.is_empty(){json!(user)}else{json!(claude)}}],"output_config":{"format":{"type":"json_schema","schema":schema}}}),
                format!("{}/messages", self.anthropic_url.trim_end_matches('/')),
            ),
        };
        protocol::prompt_cache(&provider, &mut request, system);
        let mut req = self.http.post(path).json(&request);
        req = match provider {
            Provider::Platform => return Err("Invalid platform provider".into()),
            Provider::Ollama => {
                if let Some(key) = &self.ollama_key {
                    req.bearer_auth(key)
                } else {
                    req
                }
            }
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
        let raw = crate::http_json::bounded(response, 2 * 1024 * 1024).await?;
        let value = if matches!(provider, Provider::Openai)
            && env::var("OPENAI_PROTOCOL").as_deref() == Ok("chat")
        {
            protocol::chat_response(&raw)?
        } else {
            parse(&provider, &raw)?
        };
        let value = if matches!(provider, Provider::Openai) {
            schema::restore(schema, value)?
        } else {
            value
        };
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
use protocol::parse;
mod schema;
#[cfg(test)]
mod tests;
use schema::strict_schema;
