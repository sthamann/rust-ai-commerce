//! Authenticated encryption binds config, OAuth verifiers, messages and receipts to tenant and app.
use super::*;
use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, OsRng, rand_core::RngCore},
};
use base64::{Engine, engine::general_purpose::URL_SAFE};
#[derive(Clone)]
pub struct Crypto(Aes256Gcm);
impl Crypto {
    pub fn new(raw: &str) -> Result<Self> {
        let key = URL_SAFE
            .decode(raw)
            .map_err(|_| Error::Invalid("32-byte URL-safe encryption key required"))?;
        checked(key.len() == 32, "32-byte encryption key required")?;
        Ok(Self(
            Aes256Gcm::new_from_slice(&key).map_err(|_| Error::Database)?,
        ))
    }
    pub fn seal(&self, tenant: &str, app: &str, value: &Value) -> Result<Vec<u8>> {
        let mut nonce = [0; 12];
        OsRng.fill_bytes(&mut nonce);
        let clear = json!({"tenant":tenant,"app":app,"value":value}).to_string();
        let cipher = self
            .0
            .encrypt(&Nonce::from(nonce), clear.as_bytes())
            .map_err(|_| Error::Database)?;
        Ok([nonce.as_slice(), &cipher].concat())
    }
    pub fn open(&self, tenant: &str, app: &str, raw: &[u8]) -> Result<Value> {
        checked(raw.len() > 12, "Invalid encrypted record")?;
        let clear = self
            .0
            .decrypt(
                &Nonce::from(<[u8; 12]>::try_from(&raw[..12]).map_err(|_| Error::Database)?),
                &raw[12..],
            )
            .map_err(|_| Error::Invalid("Encrypted record authentication failed"))?;
        let value: Value = serde_json::from_slice(&clear).map_err(|_| Error::Database)?;
        checked(
            value["tenant"] == tenant && value["app"] == app,
            "Credential tenant binding mismatch",
        )?;
        Ok(value["value"].clone())
    }
}
