//! Product creation accepts validated stable import IDs; the shared domain save handler retains pricing, ownership and history checks.
use super::*;
pub(crate) async fn create_product(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let id = match v.get("id") {
        None | Some(Value::Null) => Uuid::new_v4().to_string(),
        Some(Value::String(id)) if apps::identifier(id) || Uuid::parse_str(id).is_ok() => {
            id.clone()
        }
        _ => return Err(bad("Invalid product ID")),
    };
    super::product_edit::save_product(a, h, id, v, true).await
}
