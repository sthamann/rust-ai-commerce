//! Generated conformance driver; invokes the same production policy functions as the commerce server.
use serde_json::{Value, json};
use std::io::{self, BufRead};
use vendune::verified_kernel::*;
fn eval(j: &Value) -> Result<Value, String> {
    let args = &j["args"];
    match j["function"].as_str() {
        Some("discount_cap") => Ok(json!(discount_cap(
            args["total"].as_u64().ok_or("Invalid total")?,
            args["requested"].as_u64().ok_or("Invalid requested")?
        ))),
        Some("stock_admissible") => Ok(json!(stock_admissible(
            args["stock"].as_u64().ok_or("Invalid stock")?,
            args["quantity"].as_u64().ok_or("Invalid quantity")?
        ))),
        Some("refund_admissible") => Ok(json!(refund_admissible(
            args["captured"].as_u64().ok_or("Invalid captured")?,
            args["refunded"].as_u64().ok_or("Invalid refunded")?,
            args["requested"].as_u64().ok_or("Invalid requested")?
        ))),
        Some("revision_admissible") => Ok(json!(revision_admissible(
            args["current"].as_u64().ok_or("Invalid current")?,
            args["expected"].as_u64().ok_or("Invalid expected")?
        ))),
        Some("replay_admissible") => Ok(json!(replay_admissible(
            args["same_cart"].as_bool().ok_or("Invalid same_cart")?,
            args["cart_open"].as_bool().ok_or("Invalid cart_open")?,
            args["same_fingerprint"]
                .as_bool()
                .ok_or("Invalid same_fingerprint")?
        ))),
        Some("scope_admissible") => Ok(json!(scope_admissible(
            args["authenticated"]
                .as_bool()
                .ok_or("Invalid authenticated")?,
            args["known_scope"].as_bool().ok_or("Invalid known_scope")?,
            args["owner"].as_bool().ok_or("Invalid owner")?,
            args["explicit"].as_bool().ok_or("Invalid explicit")?,
            args["explicit_grant"]
                .as_bool()
                .ok_or("Invalid explicit_grant")?,
            args["default_grant"]
                .as_bool()
                .ok_or("Invalid default_grant")?
        ))),
        Some("order_edit_admissible") => Ok(json!(order_edit_admissible(
            args["terminal"].as_bool().ok_or("Invalid terminal")?
        ))),
        Some("completion_admissible") => Ok(json!(completion_admissible(
            args["terminal"].as_bool().ok_or("Invalid terminal")?,
            args["payment_ready"]
                .as_bool()
                .ok_or("Invalid payment_ready")?,
            args["deliveries_ready"]
                .as_bool()
                .ok_or("Invalid deliveries_ready")?
        ))),
        Some("cancellation_admissible") => Ok(json!(cancellation_admissible(
            args["terminal"].as_bool().ok_or("Invalid terminal")?,
            args["external_payment"]
                .as_bool()
                .ok_or("Invalid external_payment")?,
            args["refund_required"]
                .as_bool()
                .ok_or("Invalid refund_required")?,
            args["deliveries_open"]
                .as_bool()
                .ok_or("Invalid deliveries_open")?
        ))),
        Some("manual_payment_admissible") => Ok(json!(manual_payment_admissible(
            args["terminal"].as_bool().ok_or("Invalid terminal")?,
            args["external_payment"]
                .as_bool()
                .ok_or("Invalid external_payment")?,
            args["current_pending"]
                .as_bool()
                .ok_or("Invalid current_pending")?,
            args["target_paid"].as_bool().ok_or("Invalid target_paid")?
        ))),
        Some("download_admissible") => Ok(json!(download_admissible(
            args["order_blocked"]
                .as_bool()
                .ok_or("Invalid order_blocked")?,
            args["paid"].as_bool().ok_or("Invalid paid")?,
            args["simulated_authorized"]
                .as_bool()
                .ok_or("Invalid simulated_authorized")?
        ))),
        Some("checkout_contact_admissible") => Ok(json!(checkout_contact_admissible(
            args["simulated"].as_bool().ok_or("Invalid simulated")?,
            args["email_present"]
                .as_bool()
                .ok_or("Invalid email_present")?,
            args["billing_present"]
                .as_bool()
                .ok_or("Invalid billing_present")?
        ))),
        Some("receipt_admissible") => Ok(json!(receipt_admissible(
            args["expected"].as_u64().ok_or("Invalid expected")?,
            args["received"].as_u64().ok_or("Invalid received")?,
            args["same_currency"]
                .as_bool()
                .ok_or("Invalid same_currency")?,
            args["confirmed"].as_bool().ok_or("Invalid confirmed")?
        ))),
        Some("rule_authenticated") => Ok(json!(rule_authenticated(
            args["customer_present"]
                .as_bool()
                .ok_or("Invalid customer_present")?,
            args["required"].as_bool().ok_or("Invalid required")?
        ))),
        Some("rule_boolean_comparison") => Ok(json!(rule_boolean_comparison(
            args["equal"].as_bool().ok_or("Invalid equal")?,
            args["empty"].as_bool().ok_or("Invalid empty")?,
            args["eq"].as_bool().ok_or("Invalid eq")?,
            args["neq"].as_bool().ok_or("Invalid neq")?,
            args["is_empty"].as_bool().ok_or("Invalid is_empty")?
        ))),
        Some("app_flow_admissible") => Ok(json!(app_flow_admissible(
            args["allowed"].as_bool().ok_or("Invalid allowed")?,
            args["read_only"].as_bool().ok_or("Invalid read_only")?,
            args["is_public"].as_bool().ok_or("Invalid is_public")?
        ))),
        Some("platform_admissible") => Ok(json!(platform_admissible(
            args["personal"].as_bool().ok_or("Invalid personal")?,
            args["granted"].as_bool().ok_or("Invalid granted")?,
            args["active"].as_bool().ok_or("Invalid active")?
        ))),
        Some("app_read_admissible") => Ok(json!(app_read_admissible(
            args["read_only"].as_bool().ok_or("Invalid read_only")?,
            args["mutating"].as_bool().ok_or("Invalid mutating")?
        ))),
        Some("rule_xor_count") => Ok(json!(rule_xor_count(
            args["hits"].as_u64().ok_or("Invalid hits")?
        ))),
        Some("flow_delay_admissible") => Ok(json!(flow_delay_admissible(
            args["seconds"].as_u64().ok_or("Invalid seconds")?
        ))),
        Some("destination_tax_admissible") => Ok(json!(destination_tax_admissible(
            args["condition"].as_bool().ok_or("Invalid condition")?,
            args["country"].as_bool().ok_or("Invalid country")?,
            args["state"].as_bool().ok_or("Invalid state")?,
            args["postal"].as_bool().ok_or("Invalid postal")?,
            args["date"].as_bool().ok_or("Invalid date")?
        ))),
        Some("customer_group_net") => Ok(json!(customer_group_net(
            args["configured"].as_bool().ok_or("Invalid configured")?,
            args["business"].as_bool().ok_or("Invalid business")?
        ))),
        Some("app_tool_admissible") => Ok(json!(app_tool_admissible(
            args["enabled"].as_bool().ok_or("Invalid enabled")?,
            args["authorized"].as_bool().ok_or("Invalid authorized")?
        ))),
        Some("app_core_reference_admissible") => Ok(json!(app_core_reference_admissible(
            args["product"].as_bool().ok_or("Invalid product")?,
            args["private_data"]
                .as_bool()
                .ok_or("Invalid private_data")?
        ))),
        Some("checkout_review_admissible") => Ok(json!(checkout_review_admissible(
            args["revision_matches"]
                .as_bool()
                .ok_or("Invalid revision_matches")?,
            args["expected_total"]
                .as_u64()
                .ok_or("Invalid expected_total")?,
            args["actual_total"]
                .as_u64()
                .ok_or("Invalid actual_total")?,
            args["methods_confirmed"]
                .as_bool()
                .ok_or("Invalid methods_confirmed")?
        ))),
        Some("shop_request_admissible") => Ok(json!(shop_request_admissible(
            args["active"].as_bool().ok_or("Invalid active")?,
            args["paused"].as_bool().ok_or("Invalid paused")?,
            args["read_only"].as_bool().ok_or("Invalid read_only")?,
            args["settlement"].as_bool().ok_or("Invalid settlement")?
        ))),
        Some("reservation_release_admissible") => Ok(json!(reservation_release_admissible(
            args["uncaptured"].as_bool().ok_or("Invalid uncaptured")?,
            args["authorized"].as_bool().ok_or("Invalid authorized")?,
            args["void_confirmed"]
                .as_bool()
                .ok_or("Invalid void_confirmed")?
        ))),
        Some("currency_context_admissible") => Ok(json!(currency_context_admissible(
            args["enabled"].as_bool().ok_or("Invalid enabled")?,
            args["configured"].as_bool().ok_or("Invalid configured")?,
            args["fresh"].as_bool().ok_or("Invalid fresh")?
        ))),
        Some("currency_scale_admissible") => Ok(json!(currency_scale_admissible(
            args["scale"].as_u64().ok_or("Invalid scale")?
        ))),
        Some("payment_transition_admissible") => Ok(json!(payment_transition_admissible(
            args["current"].as_u64().ok_or("Invalid current")?,
            args["next"].as_u64().ok_or("Invalid next")?
        ))),
        Some("resource_quota_admissible") => Ok(json!(resource_quota_admissible(
            args["limit"].as_u64().ok_or("Invalid limit")?
        ))),
        Some("consent_admissible") => Ok(json!(consent_admissible(
            args["enabled"].as_bool().ok_or("Invalid enabled")?,
            args["current"].as_bool().ok_or("Invalid current")?,
            args["fresh"].as_bool().ok_or("Invalid fresh")?,
            args["chosen"].as_bool().ok_or("Invalid chosen")?
        ))),
        Some("legal_checkout_admissible") => Ok(json!(legal_checkout_admissible(
            args["strict"].as_bool().ok_or("Invalid strict")?,
            args["current"].as_bool().ok_or("Invalid current")?,
            args["accepted"].as_bool().ok_or("Invalid accepted")?,
            args["digital"].as_bool().ok_or("Invalid digital")?,
            args["immediate"].as_bool().ok_or("Invalid immediate")?
        ))),
        Some("notification_retry_admissible") => Ok(json!(notification_retry_admissible(
            args["rate_limited"]
                .as_bool()
                .ok_or("Invalid rate_limited")?,
            args["attempts"].as_u64().ok_or("Invalid attempts")?
        ))),
        Some("app_service_transport_admissible") => Ok(json!(app_service_transport_admissible(
            args["clean_url"].as_bool().ok_or("Invalid clean_url")?,
            args["https"].as_bool().ok_or("Invalid https")?,
            args["http"].as_bool().ok_or("Invalid http")?,
            args["loopback"].as_bool().ok_or("Invalid loopback")?,
            args["private_origin"]
                .as_bool()
                .ok_or("Invalid private_origin")?
        ))),
        Some("channel_access_admissible") => Ok(json!(channel_access_admissible(
            args["active"].as_bool().ok_or("Invalid active")?,
            args["is_private"].as_bool().ok_or("Invalid is_private")?,
            args["merchant"].as_bool().ok_or("Invalid merchant")?,
            args["preview"].as_bool().ok_or("Invalid preview")?,
            args["mutating"].as_bool().ok_or("Invalid mutating")?
        ))),
        Some("native_asset_bypass") => Ok(json!(native_asset_bypass(
            args["native_asset"]
                .as_bool()
                .ok_or("Invalid native_asset")?,
            args["hosted"].as_bool().ok_or("Invalid hosted")?
        ))),
        Some("app_package_authorized") => Ok(json!(app_package_authorized(
            args["pinned"].as_bool().ok_or("Invalid pinned")?,
            args["bundled"].as_bool().ok_or("Invalid bundled")?
        ))),
        Some("wasm_resources_admissible") => Ok(json!(wasm_resources_admissible(
            args["tables"].as_u64().ok_or("Invalid tables")?,
            args["memories"].as_u64().ok_or("Invalid memories")?,
            args["elements"].as_u64().ok_or("Invalid elements")?,
            args["pages"].as_u64().ok_or("Invalid pages")?
        ))),
        Some("app_surface_admissible") => Ok(json!(app_surface_admissible(
            args["current_package"]
                .as_bool()
                .ok_or("Invalid current_package")?,
            args["allowed_action"]
                .as_bool()
                .ok_or("Invalid allowed_action")?
        ))),
        Some("app_callback_admissible") => Ok(json!(app_callback_admissible(
            args["capability"].as_bool().ok_or("Invalid capability")?,
            args["current_role"]
                .as_bool()
                .ok_or("Invalid current_role")?
        ))),
        Some("ai_price_admissible") => Ok(json!(ai_price_admissible(
            args["price"].as_u64().ok_or("Invalid price")?,
            args["minimum"].as_u64().ok_or("Invalid minimum")?,
            args["maximum"].as_u64().ok_or("Invalid maximum")?,
            args["margin"].as_bool().ok_or("Invalid margin")?,
            args["discount"].as_bool().ok_or("Invalid discount")?,
            args["brand"].as_bool().ok_or("Invalid brand")?,
            args["available"].as_bool().ok_or("Invalid available")?
        ))),
        Some("ai_autonomy_admissible") => Ok(json!(ai_autonomy_admissible(
            args["enabled"].as_bool().ok_or("Invalid enabled")?,
            args["authorized"].as_bool().ok_or("Invalid authorized")?,
            args["price_only"].as_bool().ok_or("Invalid price_only")?,
            args["daily_budget"]
                .as_bool()
                .ok_or("Invalid daily_budget")?,
            args["within_delta"]
                .as_bool()
                .ok_or("Invalid within_delta")?
        ))),
        Some("claim_render_admissible") => Ok(json!(claim_render_admissible(
            args["confirmed"].as_bool().ok_or("Invalid confirmed")?,
            args["public_source"]
                .as_bool()
                .ok_or("Invalid public_source")?,
            args["current_source"]
                .as_bool()
                .ok_or("Invalid current_source")?,
            args["valid_time"].as_bool().ok_or("Invalid valid_time")?,
            args["exact_text"].as_bool().ok_or("Invalid exact_text")?
        ))),
        Some("experiment_result_admissible") => Ok(json!(experiment_result_admissible(
            args["final_look"].as_bool().ok_or("Invalid final_look")?,
            args["enough_units"]
                .as_bool()
                .ok_or("Invalid enough_units")?,
            args["positive_bound"]
                .as_bool()
                .ok_or("Invalid positive_bound")?
        ))),
        _ => Err("Unknown policy".into()),
    }
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    for line in io::stdin().lock().lines() {
        let input: Value = serde_json::from_str(&line?)?;
        println!("{}", eval(&input).map_err(io::Error::other)?);
    }
    Ok(())
}
