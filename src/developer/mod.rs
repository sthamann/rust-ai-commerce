//! Prompt-generated declarative apps and native coding-agent handoff, never unsandboxed model code.
use crate::*;
mod archive;
mod builds;
mod drafts;
mod generation;
mod preview;
mod routes;
pub(crate) use routes::router;

pub(crate) async fn invoke(a: &App, h: &RequestContext, name: &str, v: &Value) -> Result<Value> {
    auth::permit(h, "users")?;
    Ok(match name {
        "developer.archive" => archive::set(a, h, v).await?,
        "developer.builds" => routes::list(State(a.clone()), h.clone()).await?.0,
        "developer.import" => {
            routes::import(State(a.clone()), h.clone(), Json(v.clone()))
                .await?
                .0
        }
        "developer.stage" => {
            routes::stage(
                State(a.clone()),
                h.clone(),
                Path(
                    v["buildId"]
                        .as_str()
                        .ok_or(bad("Build ID required"))?
                        .into(),
                ),
                Json(json!({"approve":v["approve"],"digest":v["digest"]})),
            )
            .await?
            .0
        }
        "developer.task" => {
            routes::task(State(a.clone()), h.clone(), Json(v.clone()))
                .await?
                .0
        }
        _ => return Err(bad("Unknown developer tool")),
    })
}
