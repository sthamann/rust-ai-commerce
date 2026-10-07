//! Authenticated bounded app HTTP service with private OAuth callback and graceful worker lifetime.
use super::*;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::HashMap;
#[derive(Clone)]
struct Service {
    store: Store,
    token: String,
}
async fn dispatch(
    State(s): State<Service>,
    Path((app, path)): Path<(String, String)>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Response {
    let mut expected = Hmac::<Sha256>::new_from_slice(s.token.as_bytes()).unwrap();
    expected.update(format!("Bearer {}", s.token).as_bytes());
    let mut actual = Hmac::<Sha256>::new_from_slice(s.token.as_bytes()).unwrap();
    actual.update(
        h.get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .as_bytes(),
    );
    if actual
        .verify_slice(&expected.finalize().into_bytes())
        .is_err()
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error":"Unauthorized"})),
        )
            .into_response();
    }
    let tenant = h
        .get("x-tenant")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let mut response = match actions::handle(&s.store, tenant, &app, &path, &v).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    };
    response
        .headers_mut()
        .insert("cache-control", "no-store".parse().unwrap());
    response
}
async fn callback(
    State(s): State<Service>,
    Query(q): Query<HashMap<String, String>>,
    h: HeaderMap,
) -> Response {
    let result = oauth::complete(
        &s.store,
        q.get("state").map(String::as_str).unwrap_or(""),
        q.get("code").map(String::as_str).unwrap_or(""),
    )
    .await;
    let ok = result.is_ok();
    let code = if ok {
        StatusCode::OK
    } else {
        StatusCode::BAD_REQUEST
    };
    let mut response = if h
        .get("accept")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .contains("text/html")
    {
        (
            code,
            Html(completion(
                h.get("accept-language")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("en"),
                ok,
            )),
        )
            .into_response()
    } else {
        (code,Json(if let Ok(app)=result {json!({"connected":app,"message":"Connected. Return to Vendune Studio and refresh the app."})}else{json!({"error":"Authorization failed or expired. Start again in Vendune Studio."})})).into_response()
    };
    for (name, value) in [
        ("cache-control", "no-store"),
        ("referrer-policy", "no-referrer"),
        (
            "content-security-policy",
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
        ),
    ] {
        response.headers_mut().insert(name, value.parse().unwrap());
    }
    response
}
fn completion(language: &str, ok: bool) -> String {
    let locale = language.split([',', '-']).next().unwrap_or("en");
    let (title, message) = match (locale, ok) {
        ("de", true) => (
            "Konto verbunden",
            "Kehre ins Vendune Studio zurück und aktualisiere die App.",
        ),
        ("de", false) => (
            "Verbindung fehlgeschlagen",
            "Die Freigabe ist fehlgeschlagen oder abgelaufen. Starte erneut im Vendune Studio.",
        ),
        ("fr", true) => (
            "Compte connecté",
            "Revenez dans Vendune Studio et actualisez l’application.",
        ),
        ("fr", false) => (
            "Échec de connexion",
            "L’autorisation a échoué ou expiré. Recommencez dans Vendune Studio.",
        ),
        ("es", true) => (
            "Cuenta conectada",
            "Vuelve a Vendune Studio y actualiza la app.",
        ),
        ("es", false) => (
            "Conexión fallida",
            "La autorización falló o caducó. Vuelve a empezar en Vendune Studio.",
        ),
        (_, true) => (
            "Account connected",
            "Return to Vendune Studio and refresh the app.",
        ),
        (_, false) => (
            "Connection failed",
            "Authorization failed or expired. Start again in Vendune Studio.",
        ),
    };
    let language = if ["de", "fr", "es"].contains(&locale) {
        locale
    } else {
        "en"
    };
    format!(
        "<!doctype html><html lang='{language}'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{title}</title><style>body{{font:17px system-ui;background:#edf3ff;color:#172e51;display:grid;min-height:100vh;place-items:center}}main{{max-width:480px;background:white;padding:48px;border-radius:24px}}p{{line-height:1.6}}</style><main><small>Vendune Studio</small><h1>{title}</h1><p>{message}</p></main></html>"
    )
}
pub async fn run() -> Result<()> {
    let token = env::var("CONNECTOR_GATEWAY_TOKEN")
        .map_err(|_| Error::Invalid("Gateway token required"))?;
    checked(token.len() >= 32, "Strong gateway token required")?;
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(16)
        .acquire_timeout(Duration::from_secs(5))
        .connect(
            &env::var("CONNECTOR_DATABASE_URL")
                .or_else(|_| env::var("DATABASE_URL"))
                .map_err(|_| Error::Database)?,
        )
        .await?;
    let store = Store {
        pool,
        crypto: crypto::Crypto::new(
            &env::var("CONNECTOR_SECRET_KEY")
                .map_err(|_| Error::Invalid("Encryption key required"))?,
        )?,
    };
    let mut tx = store.system().await?;
    let ready: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM commerce_migrations WHERE version='049-rust-connectors')",
    )
    .fetch_one(&mut *tx)
    .await?;
    drop(tx);
    checked(ready, "Run commerce migration 049 first")?;
    if env::args().any(|s| s == "--import-legacy") {
        return super::legacy::import(&store).await;
    }
    let (stop, receiver) = tokio::sync::watch::channel(false);
    let workers = env::var("CONNECTOR_WORKERS_PER_APP")
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .filter(|n| *n > 0 && *n <= 8)
        .unwrap_or(2);
    let mut tasks = vec![];
    for app in APPS {
        for _ in 0..workers {
            tasks.push(tokio::spawn(worker::loop_worker(
                store.clone(),
                app,
                receiver.clone(),
            )));
        }
    }
    let state = Service { store, token };
    let health = state.store.clone();
    let router=Router::new().route("/health",get(move || {let store=health.clone();async move {let valid=sqlx::query("SELECT 1").execute(&store.pool).await.is_ok();(if valid{StatusCode::OK}else{StatusCode::SERVICE_UNAVAILABLE},Json(json!({"status":if valid{"healthy"}else{"unavailable"},"runtime":"rust","storage":"postgresql"})))}})).route("/oauth/callback",get(callback)).route("/{app}/{*path}",post(dispatch)).layer(DefaultBodyLimit::max(65536)).with_state(state);
    let bind = format!(
        "{}:{}",
        env::var("CONNECTOR_BIND").unwrap_or("127.0.0.1".into()),
        env::var("CONNECTOR_PORT").unwrap_or("8797".into())
    );
    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .map_err(|_| Error::Database)?;
    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).unwrap();
            tokio::select! {_=tokio::signal::ctrl_c()=>{},_=terminate.recv()=>{}}
            let _ = stop.send(true);
        })
        .await
        .map_err(|_| Error::Database)?;
    for task in tasks {
        let _ = task.await;
    }
    Ok(())
}
