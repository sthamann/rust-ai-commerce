//! Trusted request identity lives in extensions; HTTP headers carry transport inputs only.
use axum::{
    extract::{FromRequestParts, Request},
    http::{HeaderMap as RawHeaders, HeaderValue, request::Parts},
};
use std::{
    convert::Infallible,
    ops::{Deref, DerefMut},
};

#[derive(Clone, Debug, Default)]
pub(crate) struct Principal {
    pub user: Option<String>,
    pub role: Option<String>,
    pub tenant: Option<String>,
    pub permissions: Option<String>,
    pub platform_user: Option<String>,
    pub app: Option<String>,
    pub app_permissions: Option<String>,
}
#[derive(Clone, Debug, Default)]
pub(crate) struct RequestContext {
    transport: RawHeaders,
    pub principal: Principal,
    pub validated_tenant: bool,
    pub tenant_status: Option<String>,
    pub access: Option<std::sync::Arc<crate::performance::access_snapshot::AccessSnapshot>>,
    preview: Option<String>,
    reason: Option<String>,
}
pub(crate) trait HeaderReader {
    fn value(&self, key: &str) -> Option<&str>;
}
impl HeaderReader for RawHeaders {
    fn value(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(|v| v.to_str().ok())
    }
}
impl HeaderReader for RequestContext {
    fn value(&self, key: &str) -> Option<&str> {
        match key {
            "x-rac-user" => self.principal.user.as_deref(),
            "x-rac-role" => self.principal.role.as_deref(),
            "x-rac-tenant" => self.principal.tenant.as_deref(),
            "x-rac-permissions" => self.principal.permissions.as_deref(),
            "x-rac-platform-user" => self.principal.platform_user.as_deref(),
            "x-rac-channel-preview" => self.preview.as_deref(),
            "x-rac-history-reason" => self.reason.as_deref(),
            _ => self.transport.value(key),
        }
    }
}
impl RequestContext {
    pub(crate) fn new() -> Self {
        Self::default()
    }
    fn from_parts(headers: &RawHeaders, extensions: &axum::http::Extensions) -> Self {
        if let Some(trusted) = extensions.get::<Self>() {
            return trusted.clone();
        }
        let mut transport = headers.clone();
        let keys = transport
            .keys()
            .filter(|k| k.as_str().starts_with("x-rac-"))
            .cloned()
            .collect::<Vec<_>>();
        for k in keys {
            transport.remove(k);
        }
        Self {
            transport,
            access: extensions
                .get::<crate::shop_domains::HostShop>()
                .map(|h| h.access.clone()),
            ..Self::default()
        }
    }
    pub(crate) fn from_request(request: &Request) -> Self {
        Self::from_parts(request.headers(), request.extensions())
    }
    pub(crate) fn transport(&self) -> &RawHeaders {
        &self.transport
    }
    /// Internal adapters/flows explicitly construct trusted contexts; this is never an HTTP extractor.
    pub(crate) fn insert(&mut self, key: &'static str, value: HeaderValue) -> Option<HeaderValue> {
        let slot = match key {
            "x-rac-user" => Some(&mut self.principal.user),
            "x-rac-role" => Some(&mut self.principal.role),
            "x-rac-tenant" => Some(&mut self.principal.tenant),
            "x-rac-permissions" => Some(&mut self.principal.permissions),
            "x-rac-platform-user" => Some(&mut self.principal.platform_user),
            "x-rac-channel-preview" => Some(&mut self.preview),
            "x-rac-history-reason" => Some(&mut self.reason),
            _ => None,
        };
        if let Some(slot) = slot {
            return slot
                .replace(
                    value
                        .to_str()
                        .expect("Internal identity must be text")
                        .into(),
                )
                .and_then(|v| v.parse().ok());
        }
        self.transport.insert(key, value)
    }
}
impl Deref for RequestContext {
    type Target = RawHeaders;
    fn deref(&self) -> &Self::Target {
        &self.transport
    }
}
impl DerefMut for RequestContext {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.transport
    }
}
impl<S: Send + Sync> FromRequestParts<S> for RequestContext {
    type Rejection = Infallible;
    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        Ok(Self::from_parts(&parts.headers, &parts.extensions))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn headers_cannot_forge_identity_even_without_authentication_layer() {
        let mut req = Request::new(axum::body::Body::empty());
        for k in [
            "x-rac-user",
            "x-rac-role",
            "x-rac-tenant",
            "x-rac-permissions",
            "x-rac-platform-user",
        ] {
            req.headers_mut().insert(k, "owner".parse().unwrap());
        }
        let (mut parts, _) = req.into_parts();
        let context = RequestContext::from_request_parts(&mut parts, &())
            .await
            .unwrap();
        assert!(context.principal.user.is_none());
        assert!(context.value("x-rac-role").is_none());
        assert!(
            context
                .transport
                .keys()
                .all(|k| !k.as_str().starts_with("x-rac-"))
        );
    }
    #[test]
    fn trusted_identity_is_not_forwarded_to_external_services() {
        let mut context = RequestContext::new();
        context.insert("x-rac-user", "verified-user".parse().unwrap());
        let mut request = Request::new(axum::body::Body::empty());
        request.extensions_mut().insert(context);
        let extracted = RequestContext::from_request(&request);
        assert_eq!(extracted.value("x-rac-user"), Some("verified-user"));
        assert!(extracted.transport().get("x-rac-user").is_none());
    }
}
