//! Closed, side-effect-free commerce policies extracted to Lean; keep within the checked bool/u64 grammar.
pub fn discount_cap(total: u64, requested: u64) -> u64 {
    total.min(requested)
}
pub fn stock_admissible(stock: u64, quantity: u64) -> bool {
    quantity > 0 && quantity <= stock
}
pub fn refund_admissible(captured: u64, refunded: u64, requested: u64) -> bool {
    refunded <= captured && requested > 0 && requested <= captured.saturating_sub(refunded)
}
pub fn revision_admissible(current: u64, expected: u64) -> bool {
    current > 0 && current == expected
}
pub fn replay_admissible(same_cart: bool, cart_open: bool, same_fingerprint: bool) -> bool {
    same_cart && (!cart_open || same_fingerprint)
}
pub fn scope_admissible(
    authenticated: bool,
    known_scope: bool,
    owner: bool,
    explicit: bool,
    explicit_grant: bool,
    default_grant: bool,
) -> bool {
    authenticated
        && known_scope
        && (owner || explicit && explicit_grant || !explicit && default_grant)
}
pub fn order_edit_admissible(terminal: bool) -> bool {
    !terminal
}
pub fn completion_admissible(terminal: bool, payment_ready: bool, deliveries_ready: bool) -> bool {
    !terminal && payment_ready && deliveries_ready
}
pub fn cancellation_admissible(
    terminal: bool,
    external_payment: bool,
    refund_required: bool,
    deliveries_open: bool,
) -> bool {
    !terminal && !external_payment && !refund_required && deliveries_open
}
pub fn manual_payment_admissible(
    terminal: bool,
    external_payment: bool,
    current_pending: bool,
    target_paid: bool,
) -> bool {
    !terminal && !external_payment && current_pending && target_paid
}
pub fn download_admissible(order_blocked: bool, paid: bool, simulated_authorized: bool) -> bool {
    !order_blocked && (paid || simulated_authorized)
}
pub fn checkout_contact_admissible(
    simulated: bool,
    email_present: bool,
    billing_present: bool,
) -> bool {
    simulated || email_present && billing_present
}
pub fn receipt_admissible(
    expected: u64,
    received: u64,
    same_currency: bool,
    confirmed: bool,
) -> bool {
    expected == received && same_currency && confirmed
}

/// A guest address never grants the authenticated-customer rule.
pub fn rule_authenticated(customer_present: bool, required: bool) -> bool {
    customer_present == required
}

/// Explicit supported comparison operators select equality, inequality or emptiness.
pub fn rule_boolean_comparison(
    equal: bool,
    empty: bool,
    eq: bool,
    neq: bool,
    is_empty: bool,
) -> bool {
    eq && equal || neq && !equal || is_empty && empty
}

/// Only an explicitly eligible private mutation action may be bound to a durable flow.
pub fn app_flow_admissible(allowed: bool, read_only: bool, is_public: bool) -> bool {
    allowed && !read_only && !is_public
}

/// Global administration requires a personal session and a current independent operator grant.
pub fn platform_admissible(personal: bool, granted: bool, active: bool) -> bool {
    personal && granted && active
}
