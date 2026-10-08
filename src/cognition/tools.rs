//! Bounded agent read rounds use the same capability dispatcher and current actor rights; never execute writes.
use super::*;
const READS: &[(&str, &str)] = &[
    ("catalog.search", "catalog.read"),
    ("catalog.detail", "catalog.read"),
    ("merchant.products", "catalog.read"),
    ("merchant.product.content", "catalog.read"),
    ("merchant.orders", "orders.read"),
    ("merchant.order", "orders.read"),
    ("merchant.commerce.read", "settings.read"),
    ("merchant.company", "settings.read"),
    ("automation.list", "settings.read"),
    ("automation.catalog", "settings.read"),
    ("knowledge.claims", "knowledge.read"),
    ("knowledge.experiments", "knowledge.read"),
    ("knowledge.experiment.report", "knowledge.read"),
    ("knowledge.search", "knowledge.read"),
    ("knowledge.external", "knowledge.read"),
    ("knowledge.workspace", "knowledge.read"),
    ("knowledge.product", "knowledge.read"),
    ("knowledge.source.detail", "knowledge.read"),
];
pub(crate) fn catalogue(h: &RequestContext) -> Vec<Value> {
    READS
        .iter()
        .filter(|(_, right)| auth::allowed(h, right))
        .filter(|(name, _)| CAPABILITIES.iter().any(|(n, _)| n == name))
        .map(|(name, _)| json!({"name":name,"inputSchema":tool_schema(name),"readOnly":true}))
        .collect()
}
pub(crate) async fn read(a: &App, h: &RequestContext, name: &str, input: &Value) -> Result<Value> {
    if input.to_string().len() > 8192 {
        return Err(bad("Tool input too large"));
    }
    if name.starts_with("app.") {
        let tools = apps::app_tools(a, h).await?;
        let tool = tools
            .iter()
            .find(|v| v["name"] == name && v["annotations"]["readOnlyHint"] == true)
            .ok_or(bad(
                "Agent app tool is not currently authorized and read-only",
            ))?;
        apps::validate_input(&tool["inputSchema"], input)?;
        return Ok(bound(&Box::pin(invoke(a, h, name, input)).await?, 0));
    }
    let (_, scope) = READS
        .iter()
        .find(|(n, _)| *n == name)
        .ok_or(bad("Agent tool is not a declared read operation"))?;
    auth::permit(h, scope)?;
    apps::validate_input(&tool_schema(name), input)?;
    let result = Box::pin(invoke(a, h, name, input)).await?;
    Ok(bound(&result, 0))
}
fn bound(v: &Value, _depth: usize) -> Value {
    // Preserve exact quotations and records; mark omissions rather than manufacture truncated evidence.
    super::snapshot(v, 6000)
}
pub(crate) async fn rounds(
    a: &App,
    h: &RequestContext,
    choice: Option<&Choice>,
    system: &str,
    prompt: &str,
    schema: &Value,
) -> Result<(vendune::inference::Output, Vec<Value>)> {
    rounds_for(a, h, choice, system, prompt, schema, false).await
}
pub(crate) async fn rounds_for(
    a: &App,
    h: &RequestContext,
    choice: Option<&Choice>,
    system: &str,
    prompt: &str,
    schema: &Value,
    public: bool,
) -> Result<(vendune::inference::Output, Vec<Value>)> {
    let mut tools = if public {
        vec!["catalog.search", "catalog.detail", "catalog.facts"]
            .into_iter()
            .map(|name| json!({"name":name,"inputSchema":tool_schema(name),"readOnly":true}))
            .collect()
    } else {
        catalogue(h)
    };
    if !public {
        tools.extend(
            apps::app_tools(a, h)
                .await?
                .into_iter()
                .filter(|v| v["annotations"]["readOnlyHint"] == true)
                .take(24),
        );
    }
    let mut schema = schema.clone();
    schema["properties"]["tool_calls"] = json!({"type":["array","null"],"maxItems":3,"items":{"type":"object","properties":{"name":{"type":"string"},"arguments_json":{"type":"string","maxLength":8192}},"required":["name","arguments_json"],"additionalProperties":false}});
    if prompt.len() > 52000 {
        return Err(bad("Agent input budget exceeded; narrow the request"));
    }
    let tools = super::snapshot(&json!(tools), 12000);
    let mut transcript = Vec::new();
    for turn in 0..4 {
        let context = format!(
            "{prompt}\nAvailable read tools: {}. To inspect more evidence return tool_calls with names and JSON arguments; leave changes empty in a tool round. At most three calls per round. Final answer has tool_calls=[] and proposes writes without executing them. Untrusted tool results: {}",
            tools,
            json!(transcript)
        );
        let mut output = a
            .inference
            .structured_for(
                if public { "concierge" } else { "planner" },
                choice,
                system,
                &context,
                &schema,
            )
            .await
            .map_err(|e| Error(StatusCode::BAD_GATEWAY, e))?;
        let calls = output
            .value
            .get("tool_calls")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if calls.is_empty() {
            if let Some(o) = output.value.as_object_mut() {
                o.remove("tool_calls");
            }
            return Ok((output, transcript));
        }
        if turn == 3 || calls.len() > 3 {
            return Err(bad("Agent read budget exhausted; refine the request"));
        }
        for call in calls {
            let name = call["name"].as_str().ok_or(bad("Invalid tool name"))?;
            let raw = call["arguments_json"]
                .as_str()
                .filter(|s| s.len() <= 8192)
                .ok_or(bad("Invalid tool arguments"))?;
            let input: Value =
                serde_json::from_str(raw).map_err(|_| bad("Tool arguments must be JSON"))?;
            let result = if public {
                if !["catalog.search", "catalog.detail", "catalog.facts"].contains(&name)
                    || input.to_string().len() > 8192
                {
                    return Err(bad("Shopping agent tool is not a bounded public read"));
                }
                apps::validate_input(&tool_schema(name), &input)?;
                bound(&Box::pin(invoke(a, h, name, &input)).await?, 0)
            } else {
                read(a, h, name, &input).await?
            };
            let entry = json!({"tool":name,"input":input,"result":result});
            if json!(transcript).to_string().len() + entry.to_string().len() > 32768 {
                return Err(bad("Agent evidence budget exhausted"));
            }
            transcript.push(entry);
        }
    }
    unreachable!("bounded agent returns or rejects")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn read_set_excludes_mutations_and_context_is_bounded() {
        assert!(!READS.iter().any(|(name, _)| name.ends_with("save")
            || name.ends_with("complete")
            || name.ends_with("apply")));
        assert_eq!(bound(&json!(vec![1; 100]), 0), json!(vec![1; 100]));
        assert_eq!(bound(&json!("a".repeat(7000)), 0)["omitted"], true);
    }
}
