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

/// GET app routes require declared read-only behavior and exclude managed mutations.
pub fn app_read_admissible(read_only: bool, mutating: bool) -> bool {
    read_only && !mutating
}

/// Exclusive OR admits precisely one matching child.
pub fn rule_xor_count(hits: u64) -> bool {
    hits == 1
}
/// A durable flow delay is bounded to thirty days.
pub fn flow_delay_admissible(seconds: u64) -> bool {
    seconds <= 2592000
}

/// Destination tax rules require every configured jurisdiction and validity condition.
pub fn destination_tax_admissible(
    condition: bool,
    country: bool,
    state: bool,
    postal: bool,
    date: bool,
) -> bool {
    condition && country && state && postal && date
}

/// Net presentation requires a currently configured group with an explicit business basis.
pub fn customer_group_net(configured: bool, business: bool) -> bool {
    configured && business
}

/// An explicitly disabled agent action cannot be exposed or invoked, even to an authorized actor.
pub fn app_tool_admissible(enabled: bool, authorized: bool) -> bool {
    enabled && authorized
}
/// Personal core references are private; only product references may be declared public.
pub fn app_core_reference_admissible(product: bool, private_data: bool) -> bool {
    product || private_data
}

pub fn checkout_review_admissible(
    revision_matches: bool,
    expected_total: u64,
    actual_total: u64,
    methods_confirmed: bool,
) -> bool {
    revision_matches && expected_total == actual_total && methods_confirmed
}
/// Availability fence: paused merchant reads and existing payment settlement may continue.
pub fn shop_request_admissible(
    active: bool,
    paused: bool,
    read_only: bool,
    settlement: bool,
) -> bool {
    settlement || active || paused && read_only
}

/// Uncaptured stock can be restored; an authorization requires provider-confirmed void evidence.
pub fn reservation_release_admissible(
    uncaptured: bool,
    authorized: bool,
    void_confirmed: bool,
) -> bool {
    uncaptured || authorized && void_confirmed
}

// Supported explicit currency precision; larger scales must not overflow the decimal factor.
pub fn currency_scale_admissible(scale: u64) -> bool {
    scale <= 6
}

// Explicit ledger state codes are mapped by payments/state.rs; no backward monetary transitions.
pub fn payment_transition_admissible(current: u64, next: u64) -> bool {
    current <= 9
        && next <= 9
        && (current == next
            || current <= 3 && next > current && next <= 4
            || current <= 3 && (next == 7 || next == 8)
            || (current == 4 || current == 5 || current == 9) && (next == 5 || next == 6)
            || (current == 7 || current == 8) && next == 9)
}
pub fn resource_quota_admissible(limit: u64) -> bool {
    limit > 0 && limit <= 1000000
}
