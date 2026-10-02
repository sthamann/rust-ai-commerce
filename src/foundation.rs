//! Application dependencies, error responses and request context helpers.
use crate::*;

#[derive(Clone)]
pub(crate) struct App {
    pub(crate) db: PgPool,
    pub(crate) inference_slots: Arc<tokio::sync::Semaphore>,
    pub(crate) token: Arc<String>,
    pub(crate) http: reqwest::Client,
    pub(crate) inference: Inference,
    pub(crate) model: Arc<String>,
    pub(crate) ollama: Arc<String>,
    pub(crate) sandboxes: Arc<RwLock<HashMap<String, Arc<Sandbox>>>>,
}
#[derive(Debug)]
pub(crate) struct Error(pub(crate) StatusCode, pub(crate) String);
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (
            self.0,
            Json(json!({"errors":[{"code":self.0.as_u16().to_string(),"detail":self.1}]})),
        )
            .into_response()
    }
}
impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        eprintln!("database: {e}");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database operation failed".into(),
        )
    }
}
pub(crate) type Result<T> = std::result::Result<T, Error>;
pub(crate) fn bad(s: impl Into<String>) -> Error {
    Error(StatusCode::BAD_REQUEST, s.into())
}
pub(crate) fn conflict(s: &str) -> Error {
    Error(StatusCode::CONFLICT, s.into())
}
pub(crate) fn uid() -> String {
    Uuid::new_v4().simple().to_string()
}
pub(crate) fn header<'a>(h: &'a HeaderMap, k: &str) -> Option<&'a str> {
    h.get(k).and_then(|v| v.to_str().ok())
}
pub(crate) fn validate_tenant(t: &str) -> Result<()> {
    if !(2..=48).contains(&t.len())
        || !t
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        || t.starts_with('-')
    {
        return Err(bad(
            "Workspace ID must be 2..48 lowercase letters, numbers or hyphens",
        ));
    }
    Ok(())
}
pub(crate) fn tenant(h: &HeaderMap) -> Result<String> {
    let t = header(h, "x-tenant").unwrap_or("atelier");
    validate_tenant(t)?;
    Ok(t.into())
}
pub(crate) fn merchant(_a: &App, h: &HeaderMap) -> Result<String> {
    auth::permit(h, "read")?;
    let t = header(h, "x-rac-tenant").ok_or(Error(
        StatusCode::UNAUTHORIZED,
        "Merchant credential required".into(),
    ))?;
    if t != tenant(h)? {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Workspace does not match authenticated context".into(),
        ));
    }
    Ok(t.into())
}
pub(crate) fn token(h: &HeaderMap) -> Result<&str> {
    header(h, "sw-context-token").ok_or(Error(
        StatusCode::UNAUTHORIZED,
        "Customer context required".into(),
    ))
}
pub(crate) fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
