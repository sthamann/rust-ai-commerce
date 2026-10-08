//! MCP visibility and shared read-scope memoization, independent of internal planning tools.
use super::*;
/// MCP opt-out is independent of a merchant's selected internal planning tools.
pub(super) async fn invoke_transport(
    a: &App,
    h: &RequestContext,
    name: &str,
    input: &Value,
) -> Result<Value> {
    if let Some(app) = name.strip_prefix("app.") {
        let (id, action) = app
            .split_once('.')
            .ok_or(bad("Invalid app capability name"))?;
        return apps::invoke_mcp(a, h, id, action, input).await;
    }
    if [
        "catalog.search",
        "catalog.detail",
        "checkout.options",
        "cart.quote",
    ]
    .contains(&name)
    {
        performance::read_scope(invoke(a, h, name, input)).await
    } else {
        invoke(a, h, name, input).await
    }
}
