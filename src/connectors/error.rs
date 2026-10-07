//! Sanitized failures distinguish explicit rejection from ambiguous external side effects.
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
#[derive(Debug)]
pub enum Error {
    Invalid(&'static str),
    Conflict,
    Quota,
    Http(u16, u64),
    Uncertain,
    Database,
}
pub type Result<T> = std::result::Result<T, Error>;
impl From<sqlx::Error> for Error {
    fn from(_: sqlx::Error) -> Self {
        Self::Database
    }
}
impl From<reqwest::Error> for Error {
    fn from(_: reqwest::Error) -> Self {
        Self::Uncertain
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let (code, message) = match self {
            Self::Invalid(s) => (StatusCode::BAD_REQUEST, s),
            Self::Conflict => (
                StatusCode::CONFLICT,
                "Configuration or idempotency key changed",
            ),
            Self::Quota => (
                StatusCode::TOO_MANY_REQUESTS,
                "Tenant notification quota exceeded",
            ),
            _ => (
                StatusCode::BAD_GATEWAY,
                "Provider unavailable or configuration incomplete",
            ),
        };
        (code, Json(json!({"error":message}))).into_response()
    }
}
