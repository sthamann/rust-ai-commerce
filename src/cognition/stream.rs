//! SSE transports real chat completion and waiting heartbeats; detached execution retains tenant scope and the existing durable chat lease.
use super::*;
use axum::response::sse::{Event, KeepAlive, Sse};
pub(crate) fn router() -> Router<App> {
    Router::new().secure_route(
        "/api/agent/chat/stream",
        &[("POST", "knowledge.read")],
        post(chat),
    )
}
async fn chat(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<impl axum::response::IntoResponse> {
    merchant(&a, &h)?;
    auth::permit(&h, "knowledge.read")?;
    if !v["message"]
        .as_str()
        .is_some_and(|s| !s.is_empty() && s.len() <= 4000)
    {
        return Err(bad("Message must contain 1..4000 characters"));
    }
    let mut job =
        vendune::tenant_scope::spawn(
            async move { agent::merchant_chat(State(a), h, Json(v)).await },
        );
    let stream = async_stream::stream! {
        yield Ok::<_,std::convert::Infallible>(Event::default().event("accepted").data("{}"));
        let started=std::time::Instant::now();
        loop {
            tokio::select! {
                result=&mut job => {
                    let event=match result {
                        Ok(Ok(Json(value)))=>Event::default().event("complete").json_data(value),
                        Ok(Err(e))=>Event::default().event("error").json_data(json!({"errors":[{"status":e.0.as_u16(),"detail":e.1}]})),
                        Err(_)=>Event::default().event("error").json_data(json!({"errors":[{"status":500,"detail":"Chat execution interrupted; reload its conversation before retrying"}]})),
                    };
                    yield Ok(event.expect("JSON event serialization"));
                    break;
                },
                _=tokio::time::sleep(std::time::Duration::from_secs(2))=>{
                    yield Ok(Event::default().event("waiting").json_data(json!({"elapsedSeconds":started.elapsed().as_secs()})).expect("JSON event serialization"));
                }
            }
        }
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}
