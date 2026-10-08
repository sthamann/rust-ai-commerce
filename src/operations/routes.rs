//! HTTP/MCP rights for merchant CRM, fulfillment and company settings.
use super::*;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .secure_route(
            "/api/settings/master-data",
            &[("GET", "settings.read"), ("PUT", "settings.write")],
            get(master_data::get).put(master_data::put),
        )
        .secure_route(
            "/api/settings/master-data/channels/{id}",
            &[("GET", "settings.read"), ("PUT", "settings.write")],
            get(master_data::get_channel).put(master_data::put_channel),
        )
        .secure_route(
            "/api/settings/company-logo",
            &[("POST", "settings.write")],
            post(company_logo::upload),
        )
        .secure_route(
            "/api/settings/company-logo/{id}",
            &[("GET", "settings.read")],
            get(company_logo::preview),
        )
        .route("/store-api/company", get(company_public::get))
        .route("/store-api/company-logo/{id}", get(company_logo::public))
        .secure_route(
            "/api/merchant/order-state-machine",
            &[("GET", "orders.read"), ("PUT", "settings.write")],
            get(workflow::get).put(workflow::save),
        )
        .secure_route(
            "/api/merchant/customer-groups",
            &[("GET", "settings.read")],
            get(commerce::groups),
        )
        .secure_route(
            "/api/merchant/customers",
            &[("GET", "customers.read")],
            get(customers::list),
        )
        .secure_route(
            "/api/merchant/customers/{email}/addresses",
            &[("GET", "customers.read"), ("POST", "customers.write")],
            get(addresses::list).post(addresses::create),
        )
        .secure_route(
            "/api/merchant/customers/{email}/addresses/{id}",
            &[("PUT", "customers.write"), ("DELETE", "customers.write")],
            axum::routing::put(addresses::save).delete(addresses::remove),
        )
        .secure_route(
            "/api/merchant/customers/{email}",
            &[("GET", "customers.read"), ("PUT", "customers.write")],
            get(customers::detail).put(customers::save),
        )
        .secure_route(
            "/api/merchant/orders",
            &[("GET", "orders.read")],
            get(orders::list),
        )
        .secure_route(
            "/api/merchant/orders/{id}",
            &[("GET", "orders.read")],
            get(orders::detail),
        )
        .secure_route(
            "/api/merchant/orders/{id}/notes",
            &[("POST", "orders.write")],
            post(orders::note),
        )
        .secure_route(
            "/api/merchant/orders/{id}/receipts",
            &[("GET", "documents.read"), ("POST", "documents.create")],
            get(receipts::list).post(receipts::create),
        )
        .secure_route(
            "/api/merchant/receipts/settings",
            &[("GET", "settings.read"), ("PUT", "settings.write")],
            get(receipts::settings).put(receipts::save_settings),
        )
        .secure_route(
            "/api/merchant/receipts/{id}/pdf",
            &[("GET", "documents.read")],
            get(receipts::pdf),
        )
        .layer(axum::extract::DefaultBodyLimit::max(
            2 * 1024 * 1024 + 65536,
        ))
}
