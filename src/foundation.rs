//! Application dependencies, error responses and request context helpers.
use crate::*;

#[derive(Clone)]
pub(crate) struct App {
    pub(crate) db: PgPool,
    pub(crate) _connection_budget: Arc<performance::cluster_lease::Lease>,
    pub(crate) inference_slots: Arc<tokio::sync::Semaphore>,
    pub(crate) token: Arc<String>,
    pub(crate) http: reqwest::Client,
    pub(crate) inference: Inference,
    pub(crate) model: Arc<String>,
    pub(crate) sandboxes: Arc<sandbox_cache::Cache>,
    pub(crate) channel_metrics: Arc<channel_metrics::ChannelMetrics>,
    pub(crate) app_limits: Arc<apps::ServiceLimits>,
    pub(crate) admission: Arc<performance::Admission>,
    pub(crate) reads: Arc<performance::Reads>,
}
#[derive(Debug)]
pub(crate) struct Error(pub(crate) StatusCode, pub(crate) String);
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = self.0;
        let mut response = (
            self.0,
            Json(json!({"errors":[{"code":self.0.as_u16().to_string(),"detail":self.1}]})),
        )
            .into_response();
        if status == StatusCode::TOO_MANY_REQUESTS || status == StatusCode::SERVICE_UNAVAILABLE {
            response
                .headers_mut()
                .insert("retry-after", "5".parse().unwrap());
        }
        response
    }
}
impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        if matches!(e, sqlx::Error::PoolTimedOut) {
            return Self(
                StatusCode::SERVICE_UNAVAILABLE,
                "Database capacity busy; retry later".into(),
            );
        }
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
pub(crate) fn header<'a>(h: &'a impl request_context::HeaderReader, k: &str) -> Option<&'a str> {
    h.value(k)
}
pub(crate) fn validate_tenant(t: &str) -> Result<()> {
    if !(2..=48).contains(&t.len())
        || !t
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        || t.starts_with('-')
        || t.ends_with('-')
    {
        return Err(bad(
            "Workspace ID must be 2..48 lowercase letters, numbers or hyphens",
        ));
    }
    Ok(())
}
pub(crate) fn tenant(h: &impl request_context::HeaderReader) -> Result<String> {
    let t = header(h, "x-tenant")
        .or(runtime_config::get().default_tenant.as_deref())
        .ok_or(bad(
            "Shop scope required; use its domain or x-tenant header",
        ))?;
    validate_tenant(t)?;
    Ok(t.into())
}
pub(crate) fn merchant(_a: &App, h: &RequestContext) -> Result<String> {
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
pub(crate) fn token(h: &RequestContext) -> Result<&str> {
    header(h, "sw-context-token").ok_or(Error(
        StatusCode::UNAUTHORIZED,
        "Customer context required".into(),
    ))
}
pub(crate) fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}
