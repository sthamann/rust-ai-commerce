//! Every queued flow step rehydrates current membership; stored definitions never preserve revoked privileges.
use super::*;
pub(crate) async fn headers(a: &App, t: &str, actor: Option<&str>) -> Result<RequestContext> {
    let mut h = RequestContext::new();
    h.insert(
        "x-tenant",
        t.parse().map_err(|_| bad("Invalid flow tenant"))?,
    );
    h.insert("x-rac-tenant", t.parse().unwrap());
    let actor = actor.ok_or(bad("Flow actor required"))?;
    h.insert(
        "x-rac-user",
        actor.parse().map_err(|_| bad("Invalid flow actor"))?,
    );
    if actor == "bootstrap" {
        h.insert("x-rac-role", "owner".parse().unwrap());
    } else {
        let r=sqlx::query("SELECT role,permissions FROM memberships WHERE tenant=COALESCE((SELECT live_tenant FROM shop_environments WHERE tenant=$1),$1) AND user_id=$2 AND active").bind(t).bind(actor).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::FORBIDDEN,"Flow owner lost access".into()))?;
        h.insert(
            "x-rac-role",
            r.get::<String, _>("role")
                .parse()
                .map_err(|_| bad("Invalid flow role"))?,
        );
        let permissions: Value = r.get("permissions");
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
    Ok(h)
}
