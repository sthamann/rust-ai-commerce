//! HTTP transport registry; domain behavior lives in dedicated modules.
use crate::*;

pub(crate) fn router(a: App) -> Router {
    Router::new()
        .route("/products/{id}", get(storefront_pages::product_page))
        .route(
            "/products/{id}/{slug}",
            get(storefront_pages::product_page_slug),
        )
        .merge(platform::router())
        .merge(shop_domains::frontends::router())
        .secure_route(
            "/api/identity/exchange",
            &[("POST", "public")],
            post(auth::broker::exchange),
        )
        .secure_route(
            "/api/identity/credentials",
            &[("POST", "public")],
            post(auth::broker_credentials::credentials),
        )
        .secure_route(
            "/api/identity/inference",
            &[("POST", "public")],
            post(auth::broker_inference::generate)
                .layer(axum::extract::DefaultBodyLimit::max(8_200_000)),
        )
        .secure_route(
            "/api/auth/handoff",
            &[("POST", "read")],
            post(auth::handoff::create),
        )
        .secure_route(
            "/api/auth/redeem",
            &[("POST", "public")],
            post(auth::handoff::redeem),
        )
        .merge(currencies::router())
        .merge(translations::router())
        .merge(apps::app_router())
        .merge(checkout_handoff::router())
        .merge(documents::router())
        .merge(staging::router())
        .merge(developer::router())
        .merge(accounts::router())
        .merge(legal::router())
        .merge(operations::router())
        .merge(history::router())
        .merge(assets::router())
        .merge(categories::router())
        .merge(commerce::product_admin_router())
        .merge(marketing::router())
        .merge(payments::payment_router())
        .merge(cognition::cognition_router())
        .secure_route(
            "/api/merchant/commerce/channels/{channel}",
            &[("GET", "settings.read"), ("PUT", "settings.write")],
            get(commerce::get_scope).put(commerce::save_scope),
        )
        .secure_route(
            "/api/merchant/commerce/methods/{area}/{id}/dependencies",
            &[("GET", "settings.read")],
            get(commerce::method_dependencies),
        )
        .secure_route(
            "/api/runtime/outbox/{id}/retry",
            &[("POST", "settings.write")],
            post(retry_outbox),
        )
        .route("/health", get(health))
        .secure_route(
            "/api/auth/register",
            &[("POST", "public")],
            post(auth::register_user),
        )
        .secure_route(
            "/api/auth/login",
            &[("POST", "public")],
            post(auth::user_login),
        )
        .secure_route(
            "/api/auth/session",
            &[("GET", "read")],
            get(auth::user_session),
        )
        .secure_route(
            "/api/auth/logout",
            &[("POST", "read")],
            post(auth::user_logout),
        )
        .secure_route("/api/auth/access", &[("GET", "read")], get(auth::access))
        .secure_route(
            "/api/auth/sessions",
            &[("GET", "read")],
            get(auth::sessions),
        )
        .secure_route(
            "/api/auth/sessions/{id}",
            &[("DELETE", "read")],
            axum::routing::delete(auth::revoke_session),
        )
        .secure_route(
            "/api/workspace/invitations/{id}",
            &[("DELETE", "team.manage")],
            axum::routing::delete(auth::revoke_invite),
        )
        .secure_route(
            "/api/auth/accept",
            &[("POST", "public")],
            post(auth::accept_invite),
        )
        .secure_route(
            "/api/workspaces",
            &[("POST", "read")],
            post(auth::create_workspace),
        )
        .secure_route(
            "/api/workspace/members",
            &[("GET", "team.manage")],
            get(auth::members),
        )
        .secure_route(
            "/api/workspace/integrations",
            &[("GET", "team.manage"), ("POST", "team.manage")],
            get(auth::integration_list).post(auth::integration_create),
        )
        .secure_route(
            "/api/workspace/integrations/{id}",
            &[("DELETE", "team.manage")],
            axum::routing::delete(auth::integration_revoke),
        )
        .secure_route(
            "/api/workspace/members/{id}",
            &[("PUT", "team.manage")],
            axum::routing::put(auth::update_member),
        )
        .secure_route(
            "/api/workspace/invitations",
            &[("POST", "team.manage")],
            post(auth::invite_user),
        )
        .route("/store-api/context", get(context_info))
        .route("/store-api/countries", get(commerce::country_catalogue))
        .secure_route(
            "/api/merchant/overview",
            &[("GET", "orders.read")],
            get(merchant_overview),
        )
        .secure_route(
            "/api/merchant/quote",
            &[("POST", "catalog.read")],
            post(preview_quote),
        )
        .secure_route("/api/capabilities", &[("GET", "public")], get(capabilities))
        .route("/store-api/product", post(catalog_request))
        .route(
            "/store-api/product/{id}",
            get(commerce::product_detail).post(commerce::product_detail),
        )
        .route(
            "/store-api/product/{id}/reviews",
            post(commerce::submit_review),
        )
        .route("/store-api/checkout/options", get(commerce::options))
        .route(
            "/store-api/checkout/context",
            axum::routing::put(commerce::select_checkout),
        )
        .secure_route(
            "/api/merchant/commerce",
            &[("GET", "settings.read"), ("PUT", "settings.write")],
            get(commerce::merchant_config).put(commerce::save_config),
        )
        .secure_route(
            "/api/merchant/reviews/{id}",
            &[("PUT", "catalog.write")],
            axum::routing::put(commerce::moderate),
        )
        .secure_route(
            "/api/merchant/orders/{id}/transition",
            &[("POST", "orders.write")],
            post(commerce::transition_order),
        )
        .route(
            "/store-api/checkout/cart",
            get(get_cart).post(create_cart).put(edit_cart),
        )
        .route("/store-api/checkout/cart/line-item", post(add_items))
        .route("/store-api/checkout/order", post(place_order))
        .route("/store-api/account/login", post(login))
        .secure_route(
            "/api/merchant/products/{id}",
            &[("GET", "catalog.read"), ("PUT", "catalog.write")],
            get(commerce::product_editor).put(commerce::edit_product),
        )
        .secure_route(
            "/api/search/product",
            &[("POST", "catalog.read")],
            post(admin_catalog),
        )
        .secure_route(
            "/api/search/order",
            &[("POST", "orders.read")],
            post(orders),
        )
        .secure_route(
            "/api/agent/plan",
            &[("POST", "knowledge.read")],
            post(agent_plan),
        )
        .secure_route(
            "/api/agent/providers",
            &[("GET", "knowledge.read")],
            get(model_providers),
        )
        .secure_route(
            "/api/agent/chat",
            &[("POST", "knowledge.read")],
            post(merchant_chat),
        )
        .secure_route(
            "/api/agent/conversations",
            &[("GET", "knowledge.read")],
            get(conversations),
        )
        .secure_route(
            "/api/agent/conversations/{id}",
            &[("GET", "knowledge.read")],
            get(conversation),
        )
        .secure_route(
            "/api/knowledge",
            &[("GET", "knowledge.read")],
            get(knowledge_graph),
        )
        .secure_route(
            "/api/knowledge/status",
            &[("GET", "knowledge.read")],
            get(knowledge_status),
        )
        .secure_route(
            "/api/knowledge/search",
            &[("POST", "knowledge.read")],
            post(semantic_search),
        )
        .secure_route(
            "/api/knowledge/reindex",
            &[("POST", "catalog.write")],
            post(reindex),
        )
        .secure_route("/api/agent/tasks", &[("GET", "knowledge.read")], get(tasks))
        .secure_route(
            "/api/agent/tasks/{id}/apply",
            &[("POST", "catalog.write")],
            post(agent_apply),
        )
        .secure_route(
            "/api/policy",
            &[("GET", "knowledge.read")],
            get(policy_stats),
        )
        .secure_route("/api/experience", &[("POST", "public")], post(experience))
        .route("/store-api/personalization/events", post(personalization))
        .route(
            "/store-api/personalization",
            axum::routing::delete(forget_personalization),
        )
        .secure_route("/api/concierge", &[("POST", "public")], post(concierge))
        .secure_route("/api/runtime", &[("GET", "settings.read")], get(runtime))
        .secure_route(
            "/api/extensions/activate",
            &[("POST", "apps.manage")],
            post(activate_extension),
        )
        .secure_route(
            "/api/extensions",
            &[("GET", "apps.manage")],
            get(extension_state),
        )
        .route(
            "/mcp",
            post(mcp).get(|| async { StatusCode::METHOD_NOT_ALLOWED }),
        )
        .route("/.well-known/ucp", get(ucp_profile))
        .route("/ucp/v1/checkout-sessions", post(ucp_create))
        .route(
            "/ucp/v1/checkout-sessions/{id}",
            get(ucp_get).put(ucp_update),
        )
        .route(
            "/ucp/v1/checkout-sessions/{id}/complete",
            post(ucp_complete),
        )
        .route("/ucp/v1/checkout-sessions/{id}/cancel", post(ucp_cancel))
        .fallback_service(ServeDir::new("frontend/dist").append_index_html_on_directories(true))
        .layer(axum::extract::DefaultBodyLimit::max(64 * 1024))
        .layer(axum::middleware::from_fn(performance::memoize))
        .layer(axum::middleware::from_fn_with_state(
            a.clone(),
            shop_domains::frontends::serve,
        ))
        .layer(axum::middleware::from_fn_with_state(
            a.clone(),
            track_channels,
        ))
        .layer(axum::middleware::from_fn_with_state(
            a.clone(),
            auth::authenticate,
        ))
        .layer(axum::middleware::from_fn_with_state(
            a.clone(),
            shop_domains::resolve,
        ))
        .layer(axum::middleware::from_fn(security_headers::apply))
        .with_state(a)
}
