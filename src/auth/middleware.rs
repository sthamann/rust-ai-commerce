//! Resolve sessions from PostgreSQL on every request: role changes/revocation work across replicas.
//! Remove all client-supplied principal headers before adding server-derived identities.
use super::*;
use axum::{extract::Request, middleware::Next};
fn forbidden(s: &str) -> Error {
    Error(StatusCode::FORBIDDEN, s.into())
}
pub(crate) fn permit(h: &HeaderMap, kind: &str) -> Result<()> {
    let role = header(h, "x-rac-role").ok_or(Error(
        StatusCode::UNAUTHORIZED,
        "Personal login or instance administrator credential required".into(),
    ))?;
    let allowed = match kind {
        "read" => true,
        "catalog" => ["owner", "admin", "editor"].contains(&role),
        "users" | "settings" | "operations" | "extension" => ["owner", "admin"].contains(&role),
        _ => false,
    };
    if allowed {
        Ok(())
    } else {
        Err(forbidden("Role does not permit this action"))
    }
}
fn action(path: &str, method: &str) -> &'static str {
    if path.starts_with("/api/apps/") && path.contains("/actions/") {
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
pub(crate) async fn authenticate(
    State(a): State<App>,
    mut request: Request,
    next: Next,
) -> Response {
    for key in ["x-rac-user", "x-rac-role", "x-rac-tenant"] {
        request.headers_mut().remove(key);
    }
    let path = request.uri().path().to_string();
    let method = request.method().to_string();
    let public = [
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/accept",
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
  if let Some(token)=credential {
   if token==*a.token {
    let t=tenant(request.headers())?;
    request.headers_mut().insert("x-rac-user","bootstrap".parse().unwrap());request.headers_mut().insert("x-rac-role","owner".parse().unwrap());request.headers_mut().insert("x-rac-tenant",t.parse().unwrap());
   }else{
    let session=sqlx::query("SELECT user_id,default_tenant FROM user_sessions WHERE digest=$1 AND expires_at>now()").bind(hash(&token)).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::UNAUTHORIZED,"Session expired or invalid".into()))?;
    let user=session.get::<String,_>("user_id");
    let rows=sqlx::query("SELECT m.tenant,m.role FROM memberships m WHERE m.user_id=$1 AND m.active ORDER BY m.tenant").bind(&user).fetch_all(&a.db).await?;
    let chosen=header(request.headers(),"x-tenant").map(str::to_string).unwrap_or_else(||{let default=session.get::<String,_>("default_tenant");if rows.iter().any(|r|r.get::<String,_>("tenant")==default){default}else{rows.first().map(|r|r.get::<String,_>("tenant")).unwrap_or_default()}});
    let member=rows.iter().find(|r|r.get::<String,_>("tenant")==chosen).ok_or(forbidden("No active membership in this workspace"))?;
    request.headers_mut().insert("x-tenant",chosen.parse().map_err(|_|bad("Invalid tenant"))?);
    request.headers_mut().insert("x-rac-tenant",chosen.parse().unwrap());request.headers_mut().insert("x-rac-user",user.parse().unwrap());request.headers_mut().insert("x-rac-role",member.get::<String,_>("role").parse().unwrap());
   }
  }else if protected{return Err(Error(StatusCode::UNAUTHORIZED,"Merchant login required".into()));}
  if protected{permit(request.headers(),action(&path,&method))?;}
  Ok(())
 }.await;
    if let Err(e) = auth_result {
        return e.into_response();
    }
    next.run(request).await
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
