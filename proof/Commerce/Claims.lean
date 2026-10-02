import Commerce.Generated
namespace CommerceKernel

/-- A discount never exceeds the goods total. -/
theorem discount_bounded (total requested : Nat) : discount_cap total requested ≤ total := by
  simp only [discount_cap]; exact Nat.min_le_left _ _
/-- A discount never exceeds the requested amount. -/
theorem discount_requested (total requested : Nat) : discount_cap total requested ≤ requested := by
  simp only [discount_cap]; exact Nat.min_le_right _ _
/-- Exact conservation after a capped discount. -/
theorem discount_conservation (total requested : Nat) :
    total - discount_cap total requested + discount_cap total requested = total := by
  exact Nat.sub_add_cancel (discount_bounded total requested)
/-- Every admitted quantity is positive and within stock. -/
theorem stock_positive_bounded (stock quantity : Nat)
    (h : stock_admissible stock quantity = true) : 0 < quantity ∧ quantity ≤ stock := by
  simpa [stock_admissible] using h
/-- Admitted reservations cannot underflow and conserve stock. -/
theorem stock_conservation (stock quantity : Nat)
    (h : stock_admissible stock quantity = true) : stock - quantity + quantity = stock := by
  exact Nat.sub_add_cancel (stock_positive_bounded stock quantity h).2
/-- Prior plus requested refunds stay within the captured amount. -/
theorem refund_bounded (captured refunded requested : Nat)
    (h : refund_admissible captured refunded requested = true) :
    0 < requested ∧ refunded + requested ≤ captured := by
  simp only [refund_admissible, Bool.and_eq_true, decide_eq_true_eq] at h
  omega
/-- Zero refunds cannot pass the production decision. -/
theorem refund_zero_denied (captured refunded : Nat) :
    refund_admissible captured refunded 0 = false := by simp [refund_admissible]
/-- Successful writes require an exact positive persisted revision. -/
theorem revision_exact (current expected : Nat)
    (h : revision_admissible current expected = true) : 0 < current ∧ current = expected := by
  simpa [revision_admissible] using h
/-- An idempotency replay cannot target another cart. -/
theorem replay_same_cart (sameCart cartOpen sameFingerprint : Bool)
    (h : replay_admissible sameCart cartOpen sameFingerprint = true) : sameCart = true := by
  cases sameCart <;> simp_all [replay_admissible]
/-- Changed open purchases cannot reuse another fingerprint's result. -/
theorem replay_open_fingerprint (sameCart sameFingerprint : Bool)
    (h : replay_admissible sameCart true sameFingerprint = true) : sameFingerprint = true := by
  cases sameCart <;> cases sameFingerprint <;> simp_all [replay_admissible]
/-- Scope admission implies authentication and a recognized scope. -/
theorem scope_authenticated_known (auth known owner explicit grant fallback : Bool)
    (h : scope_admissible auth known owner explicit grant fallback = true) :
    auth = true ∧ known = true := by
  cases auth <;> cases known <;> simp_all [scope_admissible]
/-- Explicit scope denial cannot inherit role defaults. -/
theorem scope_explicit_no_escalation (auth known fallback : Bool) :
    scope_admissible auth known false true false fallback = false := by
  cases auth <;> cases known <;> simp [scope_admissible]
/-- Terminal states prohibit operational edits. -/
theorem terminal_edit_denied : order_edit_admissible true = false := by rfl
/-- Completion entails acceptable payment and complete physical deliveries. -/
theorem completion_safe (terminal payment deliveries : Bool)
    (h : completion_admissible terminal payment deliveries = true) :
    terminal = false ∧ payment = true ∧ deliveries = true := by
  cases terminal <;> cases payment <;> cases deliveries <;> simp_all [completion_admissible]
/-- Cancellation respects provider, refund and return constraints. -/
theorem cancellation_safe (terminal external refund deliveriesOpen : Bool)
    (h : cancellation_admissible terminal external refund deliveriesOpen = true) :
    terminal = false ∧ external = false ∧ refund = false ∧ deliveriesOpen = true := by
  cases terminal <;> cases external <;> cases refund <;> cases deliveriesOpen <;> simp_all [cancellation_admissible]
/-- Manual commands cannot confirm external provider payments. -/
theorem manual_payment_safe (terminal external pending targetPaid : Bool)
    (h : manual_payment_admissible terminal external pending targetPaid = true) :
    terminal = false ∧ external = false ∧ pending = true ∧ targetPaid = true := by
  cases terminal <;> cases external <;> cases pending <;> cases targetPaid <;> simp_all [manual_payment_admissible]
/-- Blocked orders never grant downloads. -/
theorem download_blocked_denied (paid simulated : Bool) :
    download_admissible true paid simulated = false := by simp [download_admissible]
/-- Downloads require confirmed payment or explicit simulated authorization. -/
theorem download_payment_required (blocked paid simulated : Bool)
    (h : download_admissible blocked paid simulated = true) :
    blocked = false ∧ (paid = true ∨ simulated = true) := by
  cases blocked <;> cases paid <;> cases simulated <;> simp_all [download_admissible]
/-- Financial checkout cannot bypass contact and billing. -/
theorem financial_contact_required (email billing : Bool)
    (h : checkout_contact_admissible false email billing = true) : email = true ∧ billing = true := by
  cases email <;> cases billing <;> simp_all [checkout_contact_admissible]
/-- Receipts must match the amount and currency and confirm the outcome. -/
theorem receipt_exact (expected received : Nat) (currency confirmed : Bool)
    (h : receipt_admissible expected received currency confirmed = true) :
    expected = received ∧ currency = true ∧ confirmed = true := by
  simpa [receipt_admissible, and_assoc] using h
end CommerceKernel
