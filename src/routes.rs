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
        .route("/api/identity/exchange", post(auth::broker::exchange))
        .route(
            "/api/identity/inference",
            post(auth::broker_inference::generate)
                .layer(axum::extract::DefaultBodyLimit::max(8_200_000)),
        )
        .route("/api/auth/handoff", post(auth::handoff::create))
        .route("/api/auth/redeem", post(auth::handoff::redeem))
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
        .route(
            "/api/merchant/commerce/channels/{channel}",
            get(commerce::get_scope).put(commerce::save_scope),
        )
        .route(
            "/api/merchant/commerce/methods/{area}/{id}/dependencies",
            get(commerce::method_dependencies),
        )
        .route("/health", get(health))
        .route("/api/auth/register", post(auth::register_user))
        .route("/api/auth/login", post(auth::user_login))
        .route("/api/auth/session", get(auth::user_session))
        .route("/api/auth/logout", post(auth::user_logout))
        .route("/api/auth/access", get(auth::access))
        .route("/api/auth/sessions", get(auth::sessions))
        .route(
            "/api/auth/sessions/{id}",
            axum::routing::delete(auth::revoke_session),
        )
        .route(
            "/api/workspace/invitations/{id}",
            axum::routing::delete(auth::revoke_invite),
        )
        .route("/api/auth/accept", post(auth::accept_invite))
        .route("/api/workspaces", post(auth::create_workspace))
        .route("/api/workspace/members", get(auth::members))
        .route(
            "/api/workspace/integrations",
            get(auth::integration_list).post(auth::integration_create),
        )
        .route(
            "/api/workspace/integrations/{id}",
            axum::routing::delete(auth::integration_revoke),
        )
        .route(
            "/api/workspace/members/{id}",
            axum::routing::put(auth::update_member),
        )
        .route("/api/workspace/invitations", post(auth::invite_user))
        .route("/store-api/context", get(context_info))
        .route("/store-api/countries", get(commerce::country_catalogue))
        .route("/api/merchant/overview", get(merchant_overview))
        .route("/api/merchant/quote", post(preview_quote))
        .route("/api/capabilities", get(capabilities))
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
        .route(
            "/api/merchant/commerce",
            get(commerce::merchant_config).put(commerce::save_config),
        )
        .route(
            "/api/merchant/reviews/{id}",
            axum::routing::put(commerce::moderate),
        )
        .route(
            "/api/merchant/orders/{id}/transition",
            post(commerce::transition_order),
        )
        .route(
            "/store-api/checkout/cart",
            get(get_cart).post(create_cart).put(edit_cart),
        )
        .route("/store-api/checkout/cart/line-item", post(add_items))
        .route("/store-api/checkout/order", post(place_order))
        .route("/store-api/account/login", post(login))
        .route(
            "/api/merchant/products/{id}",
            get(commerce::product_editor).put(commerce::edit_product),
        )
        .route("/api/search/product", post(admin_catalog))
        .route("/api/search/order", post(orders))
        .route("/api/agent/plan", post(agent_plan))
        .route("/api/agent/providers", get(model_providers))
        .route("/api/agent/chat", post(merchant_chat))
        .route("/api/agent/conversations", get(conversations))
        .route("/api/agent/conversations/{id}", get(conversation))
        .route("/api/knowledge", get(knowledge_graph))
        .route("/api/knowledge/status", get(knowledge_status))
        .route("/api/knowledge/search", post(semantic_search))
        .route("/api/knowledge/reindex", post(reindex))
        .route("/api/agent/tasks", get(tasks))
        .route("/api/agent/tasks/{id}/apply", post(agent_apply))
        .route("/api/policy", get(policy_stats))
        .route("/api/experience", post(experience))
        .route("/store-api/personalization/events", post(personalization))
        .route(
            "/store-api/personalization",
            axum::routing::delete(forget_personalization),
        )
        .route("/api/concierge", post(concierge))
        .route("/api/runtime", get(runtime))
        .route("/api/extensions/activate", post(activate_extension))
        .route("/api/extensions", get(extension_state))
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
        .with_state(a)
}
