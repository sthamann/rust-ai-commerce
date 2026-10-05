//! App flow dispatch uses the same permission/schema gateway as HTTP/MCP, with a stable job key.
use super::*;
pub(crate) async fn validate_app_flow(
    a: &App,
    t: &str,
    h: &HeaderMap,
    f: &flows::Flow,
) -> Result<()> {
    if f.action != "app_action" {
        return Ok(());
    }
    auth::permit(h, "apps.manage")?;
    let target = f
        .app_action
        .as_ref()
        .ok_or(bad("Flow app action required"))?;
    let m = apps::package(a, t, &target.app, true).await?;
    let act = m
        .actions
        .iter()
        .find(|x| x.name == target.action)
        .ok_or(bad("Unknown flow app action"))?;
    eligible(act)?;
    auth::permit(h, act.permission.as_deref().unwrap_or("catalog"))?;
    let args = arguments(
        act,
        &target.arguments,
        "schema-check",
        "schema-check",
        &json!({}),
        &f.event,
    );
    apps::validate_input(&act.input_schema, &args)
}
fn arguments(
    action: &apps::Action,
    base: &Value,
    key: &str,
    instruction: &str,
    event: &Value,
    kind: &str,
) -> Value {
    let mut args = base.clone();
    let props = &action.input_schema["properties"];
    if props.get("kind").is_some() {
        args["kind"] = json!(kind);
    }
    if props.get("requestKey").is_some() {
        args["requestKey"] = json!(key);
    }
    if props.get("event").is_some() {
        args["event"] = event.clone();
    }
    if props.get("template").is_some() && args.get("template").is_none() {
        args["template"] = json!(instruction);
    }
    args
}
pub(crate) async fn execute_app_flow(
    a: &App,
    t: &str,
    f: &flows::Flow,
    id: &str,
    instruction: &str,
    definition: &Value,
) -> Result<Value> {
    let target = f
        .app_action
        .as_ref()
        .ok_or(bad("Flow app action required"))?;
    let mut h = HeaderMap::new();
    h.insert(
        "x-tenant",
        t.parse().map_err(|_| bad("Invalid flow tenant"))?,
    );
    h.insert("x-rac-tenant", t.parse().unwrap());
    if f.actor.as_deref() == Some("bootstrap") {
        h.insert("x-rac-role", "owner".parse().unwrap());
    } else {
        let row = sqlx::query(
            "SELECT role,permissions FROM memberships WHERE tenant=$1 AND user_id=$2 AND active",
        )
        .bind(t)
        .bind(&f.actor)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(
            StatusCode::FORBIDDEN,
            "Flow owner lost access".into(),
        ))?;
        let role: String = row.get("role");
        h.insert(
            "x-rac-role",
            role.parse().map_err(|_| bad("Invalid flow role"))?,
        );
        let permissions: Value = row.get("permissions");
        if !permissions.is_null() {
            h.insert(
                "x-rac-permissions",
                permissions
                    .to_string()
                    .parse()
                    .map_err(|_| bad("Invalid flow permissions"))?,
            );
        }
    }
    auth::permit(&h, "settings.write")?;
    auth::permit(&h, "apps.manage")?;
    let m = apps::package(a, t, &target.app, true).await?;
    let act = m
        .actions
        .iter()
        .find(|x| x.name == target.action)
        .ok_or(bad("Unknown flow app action"))?;
    eligible(act)?;
    let event = if definition["orderId"]
        .as_str()
        .is_some_and(|s| !s.is_empty())
    {
        json!({"order":definition["orderSnapshot"],"orderId":definition["orderId"]})
    } else {
        definition["eventContext"].clone()
    };
    let args = arguments(act, &target.arguments, id, instruction, &event, &f.event);
    apps::invoke_app(a, &h, &target.app, &target.action, &args).await
}

fn eligible(action: &apps::Action) -> Result<()> {
    if !vendune::verified_kernel::app_flow_admissible(
        action.flow_allowed,
        action.read_only,
        action.public,
    ) {
        return Err(bad("Action is not eligible for flows"));
    }
    Ok(())
}
