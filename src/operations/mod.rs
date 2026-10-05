//! Merchant CRM and fulfillment APIs, shared verbatim with MCP operations capabilities.
use crate::*;
mod addresses;
mod company_logo;
mod company_model;
mod company_public;
mod customers;
mod master_data;
pub(crate) use master_data::{lock as lock_company, validate_release as validate_company_release};
mod orders;
mod receipt_pdf;
mod receipt_text;
mod receipts;
mod workflow;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route(
            "/api/settings/master-data",
            get(master_data::get).put(master_data::put),
        )
        .route(
            "/api/settings/master-data/channels/{id}",
            get(master_data::get_channel).put(master_data::put_channel),
        )
        .route("/api/settings/company-logo", post(company_logo::upload))
        .route(
            "/api/settings/company-logo/{id}",
            get(company_logo::preview),
        )
        .route("/store-api/company", get(company_public::get))
        .route("/store-api/company-logo/{id}", get(company_logo::public))
        .route(
            "/api/merchant/order-state-machine",
            get(workflow::get).put(workflow::save),
        )
        .route("/api/merchant/customers", get(customers::list))
        .route(
            "/api/merchant/customers/{email}/addresses",
            get(addresses::list).post(addresses::create),
        )
        .route(
            "/api/merchant/customers/{email}/addresses/{id}",
            axum::routing::put(addresses::save).delete(addresses::remove),
        )
        .route(
            "/api/merchant/customers/{email}",
            get(customers::detail).put(customers::save),
        )
        .route("/api/merchant/orders", get(orders::list))
        .route("/api/merchant/orders/{id}", get(orders::detail))
        .route("/api/merchant/orders/{id}/notes", post(orders::note))
        .route(
            "/api/merchant/orders/{id}/receipts",
            get(receipts::list).post(receipts::create),
        )
        .route(
            "/api/merchant/receipts/settings",
            get(receipts::settings).put(receipts::save_settings),
        )
        .route("/api/merchant/receipts/{id}/pdf", get(receipts::pdf))
        .layer(axum::extract::DefaultBodyLimit::max(
            2 * 1024 * 1024 + 65536,
        ))
}
#[derive(Deserialize, Default)]
pub(crate) struct Criteria {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub after: String,
    pub limit: Option<i64>,
    #[serde(default)]
    pub state: String,
}
impl Criteria {
    fn validate(&self) -> Result<i64> {
        if self.query.len() > 200 || self.after.len() > 254 || self.state.len() > 40 {
            return Err(bad("Invalid search criteria"));
        }
        let n = self.limit.unwrap_or(30);
        if !(1..=100).contains(&n) {
            return Err(bad("limit must be 1..100"));
        }
        Ok(n)
    }
}
pub(crate) fn permission(name: &str) -> Option<&'static str> {
    Some(match name {
        "merchant.company" => "settings.read",
        "merchant.company.save" => "settings.write",
        "merchant.workflow" => "orders.read",
        "merchant.workflow.save" => "settings.write",
        "merchant.customers" | "merchant.customer" => "customers.read",
        "merchant.customer.save"
        | "merchant.customer.address.save"
        | "merchant.customer.address.delete" => "customers.write",
        "merchant.customer.addresses" => "customers.read",
        "merchant.orders" | "merchant.order" => "orders.read",
        "merchant.order.transition" | "merchant.order.note" => "orders.write",
        "merchant.receipts" => "documents.read",
        "merchant.receipt.create" => "documents.create",
        "merchant.payment" => "payments.manage",
        "merchant.products"
        | "merchant.categories"
        | "merchant.product.assets"
        | "merchant.product.content" => "catalog.read",
        "merchant.product.create"
        | "merchant.category.create"
        | "merchant.category.save"
        | "merchant.asset.publish"
        | "merchant.product.save" => "catalog.write",
        _ => return None,
    })
}
pub(crate) async fn invoke(a: &App, h: &HeaderMap, name: &str, v: &Value) -> Result<Value> {
    merchant(a, h)?;
    auth::permit(
        h,
        permission(name).ok_or(bad("Unknown merchant operation"))?,
    )?;
    let id = || {
        v["id"]
            .as_str()
            .map(str::to_string)
            .ok_or(bad("id required"))
    };
    let criteria = || serde_json::from_value(v.clone()).map_err(|_| bad("Invalid search criteria"));
    let Json(result) = match name {
        "merchant.customer.addresses" => {
            addresses::list(State(a.clone()), h.clone(), Path(id()?)).await?
        }
        "merchant.customer.address.save" => Json(
            accounts::address_save(a, &merchant(a, h)?, &id()?, v["addressId"].as_str(), v).await?,
        ),
        "merchant.customer.address.delete" => Json(
            accounts::address_delete(
                a,
                &merchant(a, h)?,
                &id()?,
                v["addressId"].as_str().ok_or(bad("addressId required"))?,
                v["revision"].as_i64().ok_or(bad("revision required"))?,
            )
            .await?,
        ),
        "merchant.company" => master_data::read(a, h, v["channelId"].as_str()).await?,
        "merchant.company.save" => {
            master_data::save(a, h, v.clone(), v["channelId"].as_str()).await?
        }
        "merchant.workflow" => workflow::get(State(a.clone()), h.clone()).await?,
        "merchant.workflow.save" => {
            workflow::save(State(a.clone()), h.clone(), Json(v.clone())).await?
        }
        "merchant.products" => {
            commerce::list_products(
                State(a.clone()),
                h.clone(),
                axum::extract::Query(
                    serde_json::from_value(v.clone())
                        .map_err(|_| bad("Invalid catalog criteria"))?,
                ),
            )
            .await?
        }
        "merchant.categories" => {
            crate::categories::list_categories(State(a.clone()), h.clone()).await?
        }
        "merchant.product.create" => {
            commerce::create_product(State(a.clone()), h.clone(), Json(v["product"].clone()))
                .await?
        }
        "merchant.category.create" => {
            crate::categories::create_category(
                State(a.clone()),
                h.clone(),
                Json(v["category"].clone()),
            )
            .await?
        }
        "merchant.category.save" => {
            crate::categories::save_category(
                State(a.clone()),
                h.clone(),
                Path(id()?),
                Json(v["category"].clone()),
            )
            .await?
        }
        "merchant.product.content" => {
            commerce::product_editor(State(a.clone()), h.clone(), Path(id()?)).await?
        }
        "merchant.product.save" => {
            commerce::edit_product(
                State(a.clone()),
                h.clone(),
                Path(id()?),
                Json(v["product"].clone()),
            )
            .await?
        }
        "merchant.product.assets" => {
            crate::assets::list(State(a.clone()), h.clone(), Path(id()?)).await?
        }
        "merchant.asset.publish" => {
            crate::assets::publish(State(a.clone()), h.clone(), Path(id()?), Json(v.clone()))
                .await?
        }

        "merchant.orders" => {
            orders::list(
                State(a.clone()),
                h.clone(),
                axum::extract::Query(criteria()?),
            )
            .await?
        }
        "merchant.order" => orders::detail(State(a.clone()), h.clone(), Path(id()?)).await?,
        "merchant.customers" => {
            customers::list(
                State(a.clone()),
                h.clone(),
                axum::extract::Query(criteria()?),
            )
            .await?
        }
        "merchant.customer" => customers::detail(State(a.clone()), h.clone(), Path(id()?)).await?,
        "merchant.customer.save" => {
            customers::save(
                State(a.clone()),
                h.clone(),
                Path(id()?),
                Json(v["customer"].clone()),
            )
            .await?
        }
        "merchant.order.transition" => {
            commerce::transition_order(State(a.clone()), h.clone(), Path(id()?), Json(v.clone()))
                .await?
        }
        "merchant.order.note" => {
            orders::note(State(a.clone()), h.clone(), Path(id()?), Json(v.clone())).await?
        }
        "merchant.receipts" => receipts::list(State(a.clone()), h.clone(), Path(id()?)).await?,
        "merchant.receipt.create" => {
            receipts::create(State(a.clone()), h.clone(), Path(id()?), Json(v.clone())).await?
        }
        "merchant.payment" => {
            let op = v["operation"].as_str().ok_or(bad("operation required"))?;
            if !["capture", "refund", "reconcile", "cancel"].contains(&op) || v["approve"] != true {
                return Err(bad("Payment operation and approval required"));
            }
            Json(
                payments::enqueue(
                    a,
                    h,
                    &id()?,
                    op,
                    v["requestKey"].as_str().ok_or(bad("requestKey required"))?,
                    v,
                )
                .await?,
            )
        }
        _ => return Err(bad("Unknown operation")),
    };
    Ok(result)
}
