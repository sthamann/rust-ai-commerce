//! Knowledge workspace/source MCP tools delegate to the same authorized HTTP operations and schemas.
use super::*;
pub(crate) fn knowledge_schema(name: &str) -> Option<Value> {
    let props = match name {
        "knowledge.workspace" => {
            json!({"after":{"type":"string"},"query":{"type":"string","maxLength":200},"archived":{"type":"boolean"},"kind":{"type":"string"}})
        }
        "knowledge.preview" => {
            json!({"query":{"type":"string","minLength":1,"maxLength":2000},"audience":{"type":"string","enum":["customer","merchant"]},"productId":{"type":"string"}})
        }
        "knowledge.product" | "knowledge.source.detail" => json!({"id":{"type":"string"}}),
        "knowledge.source.create" | "knowledge.source.edit" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer","minimum":1},"title":{"type":"string","maxLength":200},"content":{"type":"string","maxLength":100000},"productId":{"type":["string","null"]},"kind":{"type":"string","enum":["document","datasheet","manual","care","faq","shipping","returns","warranty","brand"]},"locale":{"type":"string"},"translations":{"type":"object","additionalProperties":{"type":"object","properties":{"title":{"type":["string","null"]},"content":{"type":["string","null"]}},"additionalProperties":false}}})
        }
        "knowledge.source.visibility" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer","minimum":1},"visibility":{"type":"string","enum":["private","public"]},"approve":{"type":"boolean"}})
        }
        "knowledge.source.archive" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer","minimum":1},"archived":{"type":"boolean"},"approve":{"type":"boolean"}})
        }
        _ => return None,
    };
    Some(json!({"type":"object","properties":props,"additionalProperties":false}))
}
pub(crate) async fn knowledge_invoke(
    a: &App,
    h: &HeaderMap,
    name: &str,
    v: &Value,
) -> Result<Value> {
    let id = || {
        v["id"]
            .as_str()
            .map(String::from)
            .ok_or(bad("Source ID required"))
    };
    let Json(result) = match name {
        "knowledge.workspace" => {
            workspace::workspace(
                State(a.clone()),
                h.clone(),
                axum::extract::Query(
                    serde_json::from_value(v.clone())
                        .map_err(|_| bad("Invalid knowledge filter"))?,
                ),
            )
            .await?
        }
        "knowledge.preview" => {
            preview::preview(State(a.clone()), h.clone(), Json(v.clone())).await?
        }
        "knowledge.product" => {
            product_knowledge::product_knowledge(State(a.clone()), h.clone(), Path(id()?)).await?
        }
        "knowledge.source.detail" => {
            lifecycle::detail(State(a.clone()), h.clone(), Path(id()?)).await?
        }
        "knowledge.source.create" | "knowledge.source.edit" => {
            let mut data = v.clone();
            if let Some(o) = data.as_object_mut() {
                o.remove("id");
            }
            if name.ends_with("create") {
                ingest(State(a.clone()), h.clone(), Json(data)).await?
            } else {
                lifecycle::edit(State(a.clone()), h.clone(), Path(id()?), Json(data)).await?
            }
        }
        "knowledge.source.visibility" => {
            publish(State(a.clone()), h.clone(), Path(id()?), Json(v.clone())).await?
        }
        "knowledge.source.archive" => {
            lifecycle::lifecycle(State(a.clone()), h.clone(), Path(id()?), Json(v.clone())).await?
        }
        _ => return Err(bad("Unknown knowledge tool")),
    };
    Ok(result)
}
