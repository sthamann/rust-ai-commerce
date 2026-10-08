//! Shared operator settings; AES-GCM secrets are never part of merchant/operator read responses.
use super::*;
use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, AeadCore, OsRng, Payload},
};
use base64::{Engine, engine::general_purpose::STANDARD};

pub fn encryption_ready() -> bool {
    encryption_key().is_ok()
}
fn encryption_key() -> Result<Vec<u8>, String> {
    let raw =
        env::var("PLATFORM_SECRET_KEY").map_err(|_| "Platform secret storage is not configured")?;
    if raw.len() != 64 || !raw.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("PLATFORM_SECRET_KEY must contain 64 hexadecimal characters".into());
    }
    (0..64)
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&raw[i..i + 2], 16)
                .map_err(|_| "Invalid platform encryption key".into())
        })
        .collect()
}
fn cipher() -> Result<Aes256Gcm, String> {
    Aes256Gcm::new_from_slice(&encryption_key()?)
        .map_err(|_| "Invalid platform encryption key".into())
}
pub fn seal(provider: &str, secret: &str) -> Result<String, String> {
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let encrypted = cipher()?
        .encrypt(
            &nonce,
            Payload {
                msg: secret.as_bytes(),
                aad: provider.as_bytes(),
            },
        )
        .map_err(|_| "Could not store provider key")?;
    Ok(STANDARD.encode([&nonce[..], &encrypted].concat()))
}
pub fn open(provider: &str, encoded: &str) -> Result<String, String> {
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid provider secret")?;
    if bytes.len() < 28 {
        return Err("Invalid provider secret".into());
    }
    let plaintext = cipher()?
        .decrypt(
            &Nonce::from(<[u8; 12]>::try_from(&bytes[..12]).map_err(|_| "Invalid nonce")?),
            Payload {
                msg: &bytes[12..],
                aad: provider.as_bytes(),
            },
        )
        .map_err(|_| "Provider key cannot be decrypted; check the platform encryption key")?;
    String::from_utf8(plaintext).map_err(|_| "Invalid provider secret".into())
}
pub fn valid_endpoint(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    (url.scheme() == "https"
        || local && env::var("INFERENCE_ALLOW_LOOPBACK").as_deref() == Ok("true"))
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.host_str().is_some()
        && value.len() <= 300
}
/// Redact credentials accidentally embedded in private environment URLs before operator display.
fn safe_endpoint(value: &str) -> String {
    let Ok(mut url) = reqwest::Url::parse(value) else {
        return String::new();
    };
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    url.to_string().trim_end_matches('/').to_string()
}
impl Inference {
    pub fn with_database(mut self, db: crate::scoped_pool::ScopedPool) -> Self {
        self.db = Some(db);
        self
    }
    pub async fn invalidate(&self) {
        *self.settings.lock().await = None;
    }
    pub async fn resolved(&self) -> Result<Self, String> {
        let Some(db) = &self.db else {
            return Ok(self.clone());
        };
        let mut cache = self.settings.lock().await;
        if cache
            .as_ref()
            .is_none_or(|(at, _)| at.elapsed().as_secs() >= 5)
        {
            let row = sqlx::query_as::<_, (Value, Value)>(
                "SELECT data,secrets FROM platform_ai WHERE id=true",
            )
            .fetch_one(db)
            .await
            .map_err(|_| "Platform AI configuration unavailable")?;
            let mut data = row.0;
            for id in ["ollama", "openai", "anthropic"] {
                if let Some(secret) = row.1[id].as_str() {
                    data["providers"][id]["key"] = json!(open(id, secret)?);
                }
            }
            *cache = Some((std::time::Instant::now(), data));
        }
        let data = &cache.as_ref().unwrap().1;
        let mut runtime = self.clone();
        runtime.db = None;
        if let Some(provider) = data["defaultProvider"].as_str() {
            runtime.default_provider = serde_json::from_value(json!(provider))
                .map_err(|_| "Invalid default AI provider")?;
        }
        for id in ["ollama", "openai", "anthropic"] {
            let row = &data["providers"][id];
            let (endpoint, model, key) = match id {
                "ollama" => (
                    &mut runtime.ollama,
                    &mut runtime.local_model,
                    &mut runtime.ollama_key,
                ),
                "openai" => (
                    &mut runtime.openai_url,
                    &mut runtime.openai_model,
                    &mut runtime.openai_key,
                ),
                _ => (
                    &mut runtime.anthropic_url,
                    &mut runtime.anthropic_model,
                    &mut runtime.anthropic_key,
                ),
            };
            if let Some(value) = row["endpoint"].as_str() {
                *endpoint = value.into();
            }
            if let Some(value) = row["model"].as_str() {
                *model = value.into();
            }
            if let Some(value) = row["key"].as_str() {
                *key = Some(value.into());
            }
            if row["enabled"].as_bool() == Some(false) {
                runtime.disabled.push(id.to_string());
            }
        }
        Ok(runtime)
    }
    pub async fn public_providers(&self) -> Result<Value, String> {
        Ok(self.resolved().await?.providers())
    }
    /// Operator-visible environment defaults; key material is deliberately excluded.
    pub fn environment_configuration(&self) -> Value {
        json!({"defaultProvider":self.default_provider,"providers":{
            "ollama":{"endpoint":safe_endpoint(&self.ollama),"model":self.local_model,"enabled":true},
            "openai":{"endpoint":safe_endpoint(&self.openai_url),"model":self.openai_model,"enabled":true},
            "anthropic":{"endpoint":safe_endpoint(&self.anthropic_url),"model":self.anthropic_model,"enabled":true}}})
    }
    /// Private server adapter for embeddings/images; never returned by an HTTP route.
    pub async fn connection(&self, id: &str) -> Result<(String, Option<String>, String), String> {
        let r = self.resolved().await?;
        if r.disabled.iter().any(|v| v == id) {
            return Err("Provider is disabled by the platform operator".into());
        }
        match id {
            "openai" => Ok((r.openai_url, r.openai_key, r.openai_model)),
            "anthropic" => Ok((r.anthropic_url, r.anthropic_key, r.anthropic_model)),
            "ollama" => Ok((r.ollama, r.ollama_key, r.local_model)),
            _ => Err("Unknown inference provider".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encrypted_payload_authenticates_provider_and_rejects_damage() {
        // No environment secrets in tests: use the same AEAD primitive with a synthetic in-memory key.
        let cipher = Aes256Gcm::new_from_slice(&[7; 32]).unwrap();
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let bytes = cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: b"synthetic",
                    aad: b"openai",
                },
            )
            .unwrap();
        assert_eq!(
            cipher
                .decrypt(
                    &nonce,
                    Payload {
                        msg: &bytes,
                        aad: b"openai"
                    }
                )
                .unwrap(),
            b"synthetic"
        );
        assert!(
            cipher
                .decrypt(
                    &nonce,
                    Payload {
                        msg: &bytes,
                        aad: b"anthropic"
                    }
                )
                .is_err()
        );
        assert!(!valid_endpoint("https://key@api.openai.com/v1"));
        assert!(!valid_endpoint("file:///tmp/secrets"));
        assert!(!valid_endpoint("https://api.openai.com/v1?key=secret"));
        assert!(valid_endpoint("https://api.openai.com/v1"));
        assert_eq!(
            safe_endpoint("https://key:secret@example.test/v1?token=secret#private"),
            "https://example.test/v1"
        );
    }
}
