//! Argon2 password operations run off the asynchronous request executor.
use super::*;
pub(crate) fn email(v: &Value) -> Result<String> {
    let s = v["email"].as_str().unwrap_or("").trim().to_lowercase();
    if s.len() > 254
        || s.len() < 3
        || s.split('@').count() != 2
        || s.starts_with('@')
        || s.ends_with('@')
        || s.chars().any(char::is_whitespace)
    {
        return Err(bad("Valid email required"));
    }
    Ok(s)
}
pub(crate) fn password(v: &Value) -> Result<String> {
    let p = v["password"].as_str().unwrap_or("");
    if !(12..=128).contains(&p.len()) {
        return Err(bad("Password must contain 12..128 characters"));
    }
    Ok(p.into())
}
pub(crate) fn name(v: &Value) -> Result<String> {
    let n = v["name"].as_str().unwrap_or("").trim();
    if n.is_empty() || n.len() > 100 {
        return Err(bad("Name must contain 1..100 characters"));
    }
    Ok(n.into())
}
pub(crate) async fn hash_password(password: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let salt = SaltString::encode_b64(Uuid::new_v4().as_bytes()).unwrap();
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|p| p.to_string())
            .map_err(|_| bad("Password hashing failed"))
    })
    .await
    .map_err(|_| bad("Password worker failed"))?
}
pub(crate) async fn verify_password(password: String, saved: String) -> Result<bool> {
    tokio::task::spawn_blocking(move || {
        PasswordHash::new(&saved).is_ok_and(|hash| {
            Argon2::default()
                .verify_password(password.as_bytes(), &hash)
                .is_ok()
        })
    })
    .await
    .map_err(|_| bad("Password worker failed"))
}
pub(crate) fn role_allowed(actor: &str, target: &str) -> bool {
    ["owner", "admin", "editor", "viewer"].contains(&target)
        && (actor == "owner" || actor == "admin" && target != "owner")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validation_and_role_boundaries() {
        assert!(email(&json!({"email":" x@example.test "})).is_ok());
        assert!(email(&json!({"email":"a@@b"})).is_err());
        assert!(password(&json!({"password":"short"})).is_err());
        assert!(role_allowed("owner", "owner"));
        assert!(!role_allowed("admin", "owner"));
        assert!(!role_allowed("editor", "viewer"));
    }
    #[tokio::test]
    async fn password_round_trip() {
        let saved = hash_password("a-test-password-123".into()).await.unwrap();
        assert!(
            verify_password("a-test-password-123".into(), saved.clone())
                .await
                .unwrap()
        );
        assert!(
            !verify_password("a-wrong-password-123".into(), saved)
                .await
                .unwrap()
        );
    }
}
