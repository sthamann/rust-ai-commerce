//! Resolve sessions from PostgreSQL on every request: role changes/revocation work across replicas.
//! Remove all client-supplied principal headers before adding server-derived identities.
use super::*;
use axum::{extract::Request, middleware::Next};
fn forbidden(s: &str) -> Error {
    Error(StatusCode::FORBIDDEN, s.into())
}
pub(crate) fn permit(h: &HeaderMap, kind: &str) -> Result<()> {
    header(h, "x-rac-role").ok_or(Error(
        StatusCode::UNAUTHORIZED,
        "Personal login or instance administrator credential required".into(),
    ))?;
    let allowed = super::permissions::allowed(h, kind);
    if allowed {
        Ok(())
    } else {
        Err(forbidden("Role does not permit this action"))
    }
}
fn action(path: &str, method: &str) -> &'static str {
    if path == "/api/search/product"
        || (path.starts_with("/api/merchant/products")
            || path.starts_with("/api/merchant/categories"))
            && method == "GET"
    {
        return "catalog.read";
    }
    if path.starts_with("/api/knowledge") || path == "/api/policy" {
        return if path.ends_with("/reindex") {
            "catalog"
        } else {
            "knowledge.read"
        };
    }
    if path.starts_with("/api/auth/") {
        return "read";
    }
    if path.starts_with("/api/settings/") {
        return if method == "GET" {
            "settings.read"
        } else {
            "settings.write"
        };
    }
    if path == "/api/merchant/order-state-machine" {
        return if method == "GET" {
            "orders.read"
        } else {
            "settings.write"
        };
    }
    if path.starts_with("/api/merchant/customers") {
        return if method == "GET" {
            "customers.read"
        } else {
            "customers.write"
        };
    }
    if path.starts_with("/api/merchant/receipts") {
        return if method == "GET" {
            "documents.read"
        } else {
            "documents.create"
        };
    }
    if path.starts_with("/api/merchant/orders") {
        return if path.contains("/receipts") {
            if method == "GET" {
                "documents.read"
            } else {
                "documents.create"
            }
        } else if method == "GET" {
            "orders.read"
        } else {
            "operations"
        };
    }
    if path.starts_with("/api/payments/jobs/") {
        return "payments.manage";
    }
    if path.starts_with("/api/payments") || path.starts_with("/api/payment-providers") {
        return if method == "GET" {
            "payments.read"
        } else {
            "payments.manage"
        };
    }
    if path.starts_with("/api/apps/") && (path.contains("/actions/") || path.contains("/http/")) {
        return "read";
    }
    if path.starts_with("/api/workspace/") {
        return "users";
    }
    if path == "/api/auth/logout"
        || method == "GET"
        || [
            "/api/search/product",
            "/api/search/order",
            "/api/merchant/quote",
            "/api/knowledge/search",
            "/api/agent/plan",
            "/api/agent/chat",
        ]
        .contains(&path)
    {
        return "read";
    }
    if path == "/api/merchant/commerce" {
        return "settings";
    }
    if path.starts_with("/api/merchant/orders/") {
        return "operations";
    }
    if path == "/api/extensions/activate" {
        return "extension";
    }
    "catalog"
}
pub(crate) async fn authenticate(state: State<App>, request: Request, next: Next) -> Response {
    // Identity lookup is trusted; the admitted business request gets a narrower context below.
    vendune::tenant_scope::scoped(
        vendune::tenant_scope::Scope::System,
        authenticate_scoped(state, request, next),
    )
    .await
}
async fn authenticate_scoped(State(a): State<App>, mut request: Request, next: Next) -> Response {
    for key in [
        "x-rac-user",
        "x-rac-role",
        "x-rac-tenant",
        "x-rac-permissions",
        "x-rac-platform-user",
        "x-rac-history-reason",
    ] {
        request.headers_mut().remove(key);
    }
    let path = request.uri().path().to_string();
    let method = request.method().to_string();
    // Public image subrequests cannot carry frontend custom headers. Resolve only the scoped asset URL
    // before sandbox/session admission; private shops still require the same merchant credential.
    if (path.starts_with("/store-api/assets/") || path.starts_with("/store-api/company-logo/"))
        && header(request.headers(), "x-tenant").is_none()
        && let Ok(url) = reqwest::Url::parse(&format!("http://local{}", request.uri()))
        && let Some((_, shop)) = url.query_pairs().find(|(k, _)| k == "shop")
    {
        match shop.parse() {
            Ok(value) => {
                request.headers_mut().insert("x-tenant", value);
            }
            Err(_) => return bad("Invalid asset shop scope").into_response(),
        }
    }
    // Global administration has its own personal-session grant; tenant/admin/bootstrap roles cannot inherit it.
    if path.starts_with("/api/platform/") {
        match crate::platform::authenticate(&a, request.headers()).await {
            Ok(user) => {
                request
                    .headers_mut()
                    .insert("x-rac-platform-user", user.parse().unwrap());
            }
            Err(e) => return e.into_response(),
        }
        return next.run(request).await;
    }

    let public = [
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/accept",
        "/api/auth/redeem",
        "/api/identity/exchange",
        "/api/identity/inference",
        "/api/experience",
        "/api/concierge",
        "/api/capabilities",
    ]
    .contains(&path.as_str());
    let protected = path.starts_with("/api/") && !public;
    let credential = header(request.headers(), "authorization")
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_string);
    let auth_result:Result<()>=async {
  let selected_tenant=tenant(request.headers())?;
  let environment_parent=crate::staging::parent(&a,&selected_tenant).await?;
  if environment_parent.is_some() && (path.starts_with("/api/workspace") || path.starts_with("/api/environments")){return Err(forbidden("Manage membership and environments in the live workspace"));}
  if environment_parent.is_some() && credential.is_none() && (path.starts_with("/store-api/") || path.starts_with("/api/") || path.starts_with("/ucp/") || path=="/mcp"){return Err(Error(StatusCode::UNAUTHORIZED,"Private sandbox requires a merchant session".into()));}
  if let Some(token)=credential {
   if token==*a.token {
    if env::var("ALLOW_BOOTSTRAP_AUTH").as_deref()==Ok("false"){return Err(Error(StatusCode::UNAUTHORIZED,"Personal merchant session required".into()));}
    let t=tenant(request.headers())?;
    request.headers_mut().insert("x-rac-user","bootstrap".parse().unwrap());request.headers_mut().insert("x-rac-role","owner".parse().unwrap());request.headers_mut().insert("x-rac-tenant",t.parse().unwrap());
   }else{
    let (user,default_tenant,key_permissions)=resolve_credential(&a,&token).await?;
    let rows=sqlx::query("SELECT m.tenant,m.role,m.permissions FROM memberships m WHERE m.user_id=$1 AND m.active ORDER BY m.tenant").bind(&user).fetch_all(&a.db).await?;
    let chosen=header(request.headers(),"x-tenant").map(str::to_string).unwrap_or_else(||{let default=default_tenant.clone();if rows.iter().any(|r|r.get::<String,_>("tenant")==default){default}else{rows.first().map(|r|r.get::<String,_>("tenant")).unwrap_or_default()}});
    let scope=crate::staging::parent(&a,&chosen).await?.unwrap_or_else(||chosen.clone());
    if key_permissions.is_some() && scope!=default_tenant {return Err(forbidden("Integration key is bound to one workspace"));}
    let member=rows.iter().find(|r|r.get::<String,_>("tenant")==scope).ok_or(forbidden("No active membership in this workspace"))?;
    request.headers_mut().insert("x-tenant",chosen.parse().map_err(|_|bad("Invalid tenant"))?);
    request.headers_mut().insert("x-rac-tenant",chosen.parse().unwrap());
    let permissions:Value=member.get("permissions");if !permissions.is_null(){request.headers_mut().insert("x-rac-permissions",permissions.to_string().parse().map_err(|_|bad("Invalid permissions"))?);}request.headers_mut().insert("x-rac-user",user.parse().unwrap());request.headers_mut().insert("x-rac-role",member.get::<String,_>("role").parse().unwrap());
    if let Some(scopes)=key_permissions{let mut actor=HeaderMap::new();actor.insert("x-rac-role",member.get::<String,_>("role").parse().unwrap());if !permissions.is_null(){actor.insert("x-rac-permissions",permissions.to_string().parse().unwrap());}let allowed=scopes.into_iter().filter(|s|super::permissions::allowed(&actor,s)).collect::<Vec<_>>();request.headers_mut().insert("x-rac-permissions",json!(allowed).to_string().parse().unwrap());request.headers_mut().insert("x-rac-role","admin".parse().unwrap());}

   }
  }else if protected{return Err(Error(StatusCode::UNAUTHORIZED,"Merchant login required".into()));}
  if protected{permit(request.headers(),action(&path,&method))?;}
  Ok(())
 }.await;
    if let Err(e) = auth_result {
        return e.into_response();
    }
    if let Err(e) = crate::platform::admit(&a, request.headers(), &path, &method).await {
        return e.into_response();
    }
    let scope = if public
        || path.starts_with("/api/auth/")
        || path == "/api/workspaces"
        || path.starts_with("/api/developer")
        || path.starts_with("/api/environments")
        || path.starts_with("/api/workspace/")
    {
        // Provisioning, identity and staging require cross-workspace reads, after their existing grants.
        vendune::tenant_scope::Scope::System
    } else {
        match tenant(request.headers()) {
            Ok(t) => vendune::tenant_scope::Scope::Tenant(t),
            Err(e) => return e.into_response(),
        }
    };
    vendune::tenant_scope::scoped(scope, performance::admit_request(&a, request, next)).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn role_matrix() {
        for role in ["owner", "admin", "editor", "viewer"] {
            let mut h = HeaderMap::new();
            h.insert("x-rac-role", role.parse().unwrap());
            assert!(permit(&h, "read").is_ok());
            assert_eq!(permit(&h, "catalog").is_ok(), role != "viewer");
            assert_eq!(
                permit(&h, "users").is_ok(),
                role == "owner" || role == "admin"
            );
            assert!(permit(&h, "unknown").is_err());
        }
        assert!(permit(&HeaderMap::new(), "read").is_err());
    }
    #[test]
    fn transport_permissions() {
        assert_eq!(action("/api/merchant/commerce", "PUT"), "settings");
        assert_eq!(
            action("/api/merchant/orders/id/transition", "POST"),
            "operations"
        );
        assert_eq!(action("/api/search/order", "POST"), "read");
        assert_eq!(action("/api/agent/tasks/id/apply", "POST"), "catalog");
    }
}
