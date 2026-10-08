//! Single admission boundary for Store API, UCP/MCP and hosted storefronts; previews cannot purchase.
use crate::*;
fn shopper_path(path: &str) -> bool {
    path.starts_with("/store-api/")
        || path.starts_with("/ucp/")
        || path.starts_with("/products/")
        || path == "/mcp"
        || path == "/api/experience"
        || path == "/api/concierge"
}
pub(crate) fn preview_mutation(path: &str, method: &str) -> bool {
    if method == "GET" || method == "HEAD" {
        return false;
    }
    // Cart edits are simulations. Orders, customer/account writes, reviews, payments and AI are not.
    !matches!(
        path,
        "/store-api/product"
            | "/store-api/navigation"
            | "/store-api/checkout/cart"
            | "/store-api/checkout/cart/line-item"
            | "/store-api/checkout/context"
            | "/store-api/checkout/coupons"
    ) && !(path.starts_with("/experience-api/")
        && [
            "/commerce/product",
            "/commerce/checkout/cart",
            "/commerce/checkout/cart/line-item",
            "/commerce/checkout/context",
            "/commerce/checkout/coupons",
        ]
        .iter()
        .any(|end| path.ends_with(end)))
}
pub(crate) async fn admit(
    a: &App,
    h: &RequestContext,
    path: &str,
    method: &str,
    host: Option<&str>,
) -> Result<bool> {
    if path == "/mcp" && auth::permit(h, "settings.read").is_ok() {
        return Ok(false);
    }
    if path.starts_with("/channel-preview/") {
        return Ok(false);
    }
    let hosted = host.is_some() && crate::shop_domains::frontends::public_path(path);
    if !shopper_path(path) && !hosted {
        return Ok(false);
    }
    let t = tenant(h)?;
    let id = super::channel_id(h);
    let row = sqlx::query("SELECT data,revision FROM sales_channels WHERE tenant=$1 AND id=$2")
        .bind(&t)
        .bind(id)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(
            StatusCode::NOT_FOUND,
            "Sales channel unavailable".into(),
        ))?;
    let data: Value = row.get("data");
    let active = data["active"] == true;
    let private = data["visibility"] == "private";
    let supplied = header(h, "x-channel-preview")
        .map(str::to_owned)
        .or_else(|| super::channel_preview::cookie(h));
    let preview = if let Some(token) = supplied {
        let valid =
            super::channel_preview::valid(a, &t, id, row.get("revision"), &token, host).await?;
        if !valid {
            return Err(Error(
                StatusCode::FORBIDDEN,
                "Preview expired, revoked or belongs to another channel".into(),
            ));
        }
        true
    } else {
        false
    };
    let merchant = auth::permit(h, "settings.read").is_ok();
    if !verified_kernel::channel_access_admissible(
        active,
        private,
        merchant,
        preview,
        preview_mutation(path, method),
    ) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Sales channel is paused or private; open an authorized merchant preview".into(),
        ));
    }
    // Possessing a preview never grants a write path, even while the channel is public.
    if preview && preview_mutation(path, method) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Merchant preview cannot place orders or change customer data".into(),
        ));
    }
    Ok(preview)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_only_admits_bounded_simulations() {
        assert!(!preview_mutation("/store-api/product", "POST"));
        assert!(!preview_mutation("/store-api/navigation", "POST"));
        assert!(!preview_mutation(
            "/experience-api/shops/own/commerce/checkout/cart",
            "PUT"
        ));
        for path in [
            "/store-api/checkout/order",
            "/store-api/account/register",
            "/store-api/account/profile",
            "/store-api/payment/finalize",
            "/mcp",
            "/ucp/v1/checkout-sessions",
            "/experience-api/shops/own/ask",
        ] {
            assert!(preview_mutation(path, "POST"), "{path}");
        }
    }
}
