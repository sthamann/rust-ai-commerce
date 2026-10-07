-- Generated from src/verified_kernel.rs; do not edit.
import Std

namespace CommerceKernel

def discount_cap (total : Nat) (requested : Nat) : Nat :=
  (min total requested)

def stock_admissible (stock : Nat) (quantity : Nat) : Bool :=
  ((decide (quantity > 0)) && (decide (quantity ≤ stock)))

def refund_admissible (captured : Nat) (refunded : Nat) (requested : Nat) : Bool :=
  (((decide (refunded ≤ captured)) && (decide (requested > 0))) && (decide (requested ≤ (captured - refunded))))

def revision_admissible (current : Nat) (expected : Nat) : Bool :=
  ((decide (current > 0)) && (decide (current = expected)))

def replay_admissible (same_cart : Bool) (cart_open : Bool) (same_fingerprint : Bool) : Bool :=
  (same_cart && ((!cart_open) || same_fingerprint))

def scope_admissible (authenticated : Bool) (known_scope : Bool) (owner : Bool) (explicit : Bool) (explicit_grant : Bool) (default_grant : Bool) : Bool :=
  ((authenticated && known_scope) && ((owner || (explicit && explicit_grant)) || ((!explicit) && default_grant)))

def order_edit_admissible (terminal : Bool) : Bool :=
  (!terminal)

def completion_admissible (terminal : Bool) (payment_ready : Bool) (deliveries_ready : Bool) : Bool :=
  (((!terminal) && payment_ready) && deliveries_ready)

def cancellation_admissible (terminal : Bool) (external_payment : Bool) (refund_required : Bool) (deliveries_open : Bool) : Bool :=
  ((((!terminal) && (!external_payment)) && (!refund_required)) && deliveries_open)

def manual_payment_admissible (terminal : Bool) (external_payment : Bool) (current_pending : Bool) (target_paid : Bool) : Bool :=
  ((((!terminal) && (!external_payment)) && current_pending) && target_paid)

def download_admissible (order_blocked : Bool) (paid : Bool) (simulated_authorized : Bool) : Bool :=
  ((!order_blocked) && (paid || simulated_authorized))

def checkout_contact_admissible (simulated : Bool) (email_present : Bool) (billing_present : Bool) : Bool :=
  (simulated || (email_present && billing_present))

def receipt_admissible (expected : Nat) (received : Nat) (same_currency : Bool) (confirmed : Bool) : Bool :=
  (((decide (expected = received)) && same_currency) && confirmed)

def rule_authenticated (customer_present : Bool) (required : Bool) : Bool :=
  (decide (customer_present = required))

def rule_boolean_comparison (equal : Bool) (empty : Bool) (eq : Bool) (neq : Bool) (is_empty : Bool) : Bool :=
  (((eq && equal) || (neq && (!equal))) || (is_empty && empty))

def app_flow_admissible (allowed : Bool) (read_only : Bool) (is_public : Bool) : Bool :=
  ((allowed && (!read_only)) && (!is_public))

def platform_admissible (personal : Bool) (granted : Bool) (active : Bool) : Bool :=
  ((personal && granted) && active)

def app_read_admissible (read_only : Bool) (mutating : Bool) : Bool :=
  (read_only && (!mutating))

def rule_xor_count (hits : Nat) : Bool :=
  (decide (hits = 1))

def flow_delay_admissible (seconds : Nat) : Bool :=
  (decide (seconds ≤ 2592000))

def destination_tax_admissible (condition : Bool) (country : Bool) (state : Bool) (postal : Bool) (date : Bool) : Bool :=
  ((((condition && country) && state) && postal) && date)

def customer_group_net (configured : Bool) (business : Bool) : Bool :=
  (configured && business)

def app_tool_admissible (enabled : Bool) (authorized : Bool) : Bool :=
  (enabled && authorized)

def app_core_reference_admissible (product : Bool) (private_data : Bool) : Bool :=
  (product || private_data)

def checkout_review_admissible (revision_matches : Bool) (expected_total : Nat) (actual_total : Nat) (methods_confirmed : Bool) : Bool :=
  ((revision_matches && (decide (expected_total = actual_total))) && methods_confirmed)

def shop_request_admissible (active : Bool) (paused : Bool) (read_only : Bool) (settlement : Bool) : Bool :=
  ((settlement || active) || (paused && read_only))

def reservation_release_admissible (uncaptured : Bool) (authorized : Bool) (void_confirmed : Bool) : Bool :=
  (uncaptured || (authorized && void_confirmed))

def currency_context_admissible (enabled : Bool) (configured : Bool) (fresh : Bool) : Bool :=
  ((enabled && configured) && fresh)

def currency_scale_admissible (scale : Nat) : Bool :=
  (decide (scale ≤ 6))

def payment_transition_admissible (current : Nat) (next : Nat) : Bool :=
  (((decide (current ≤ 9)) && (decide (next ≤ 9))) && (((((decide (current = next)) || (((decide (current ≤ 3)) && (decide (next > current))) && (decide (next ≤ 4)))) || ((decide (current ≤ 3)) && ((decide (next = 7)) || (decide (next = 8))))) || ((((decide (current = 4)) || (decide (current = 5))) || (decide (current = 9))) && ((decide (next = 5)) || (decide (next = 6))))) || (((decide (current = 7)) || (decide (current = 8))) && (decide (next = 9)))))

def resource_quota_admissible (limit : Nat) : Bool :=
  ((decide (limit > 0)) && (decide (limit ≤ 1000000)))

def consent_admissible (enabled : Bool) (current : Bool) (fresh : Bool) (chosen : Bool) : Bool :=
  (((enabled && current) && fresh) && chosen)

def legal_checkout_admissible (strict : Bool) (current : Bool) (accepted : Bool) (digital : Bool) (immediate : Bool) : Bool :=
  ((!strict) || ((current && accepted) && ((!digital) || immediate)))

def notification_retry_admissible (rate_limited : Bool) (attempts : Nat) : Bool :=
  (rate_limited && (decide (attempts < 8)))

def app_service_transport_admissible (clean_url : Bool) (https : Bool) (http : Bool) (loopback : Bool) (private_origin : Bool) : Bool :=
  (clean_url && (https || (http && (loopback || private_origin))))

end CommerceKernel
