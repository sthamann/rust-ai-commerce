//! Rights are registered beside each API method. Missing registrations always deny access.
use crate::{App, Router};
use axum::routing::MethodRouter;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};
type Registry = HashMap<(&'static str, &'static str), &'static str>;
fn registry() -> &'static Mutex<Registry> {
    static ROUTES: OnceLock<Mutex<Registry>> = OnceLock::new();
    ROUTES.get_or_init(|| Mutex::new(HashMap::new()))
}
pub(crate) trait SecureRoutes {
    fn secure_route(
        self,
        path: &'static str,
        rights: &'static [(&'static str, &'static str)],
        methods: MethodRouter<App>,
    ) -> Self;
}
impl SecureRoutes for Router<App> {
    fn secure_route(
        self,
        path: &'static str,
        rights: &'static [(&'static str, &'static str)],
        methods: MethodRouter<App>,
    ) -> Self {
        let mut registry = registry().lock().unwrap();
        for &(method, right) in rights {
            assert!(
                matches!(right, "public" | "platform" | "read") || super::SCOPES.contains(&right),
                "Invalid API permission"
            );
            if let Some(old) = registry.insert((path, method), right) {
                assert_eq!(old, right, "Conflicting API permission");
            }
        }
        drop(registry);
        self.route(path, methods)
    }
}
pub(crate) fn lookup(path: &str, method: &str) -> Option<&'static str> {
    let registry = registry().lock().unwrap();
    registry
        .get(&(path, method))
        .or_else(|| {
            if method == "HEAD" {
                registry.get(&(path, "GET"))
            } else {
                None
            }
        })
        .copied()
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unregistered_routes_and_methods_are_denied() {
        let test_path = "/api/test/permissions";
        let _: Router<App> = Router::new().secure_route(
            test_path,
            &[("GET", "orders.read")],
            axum::routing::get(|| async { "ok" }),
        );
        assert_eq!(lookup("/api/test/permissions", "GET"), Some("orders.read"));
        assert_eq!(lookup("/api/test/permissions", "HEAD"), Some("orders.read"));
        assert_eq!(lookup("/api/test/permissions", "POST"), None);
        assert_eq!(lookup("/api/unknown/sensitive-data", "GET"), None);
    }
}
