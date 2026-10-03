//! MCP automation tools call the same tenant-bound handlers and validators as HTTP; no separate mutation semantics.
use super::*;
pub(crate) async fn invoke(a: &App, h: &HeaderMap, name: &str, v: &Value) -> Result<Value> {
    merchant(a, h)?;
    let Json(value) = match name {
        "automation.catalog" => catalog::catalog(State(a.clone()), h.clone()).await?,
        "automation.list" => routes::list(State(a.clone()), h.clone()).await?,
        "automation.save" => {
            routes::save(
                State(a.clone()),
                h.clone(),
                Path((
                    v["kind"].as_str().ok_or(bad("Kind required"))?.into(),
                    v["id"].as_str().ok_or(bad("ID required"))?.into(),
                )),
                Json(v.clone()),
            )
            .await?
        }
        "automation.preview" => {
            routes::preview(State(a.clone()), h.clone(), Json(v.clone())).await?
        }
        "automation.import" => catalog::import(h.clone(), Json(v["condition"].clone())).await?,
        _ => return Err(bad("Unknown automation capability")),
    };
    Ok(value)
}
