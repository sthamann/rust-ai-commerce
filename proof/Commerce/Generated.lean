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

end CommerceKernel
