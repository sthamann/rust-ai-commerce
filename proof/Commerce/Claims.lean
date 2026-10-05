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

/-- The cap also preserves every valid requested discount exactly. -/
theorem discount_exact (total requested : Nat) : discount_cap total requested = min total requested := by
  rfl
/-- Valid stock reservations are accepted, not merely safe when accepted. -/
theorem stock_exact (stock quantity : Nat) :
    stock_admissible stock quantity = true ↔ 0 < quantity ∧ quantity ≤ stock := by
  simp [stock_admissible]
/-- Exact refund admission includes completeness for valid refunds. -/
theorem refund_exact (captured refunded requested : Nat) :
    refund_admissible captured refunded requested = true ↔
    0 < requested ∧ refunded + requested ≤ captured := by
  simp only [refund_admissible, Bool.and_eq_true, decide_eq_true_eq]
  omega
/-- Correct positive revisions are always admitted. -/
theorem revision_exact_behavior (current expected : Nat) :
    revision_admissible current expected = true ↔ 0 < current ∧ current = expected := by
  simp [revision_admissible]
/-- Exact replay behavior preserves valid same-cart retries. -/
theorem replay_exact (sameCart cartOpen fingerprint : Bool) :
    replay_admissible sameCart cartOpen fingerprint = true ↔
    sameCart = true ∧ (cartOpen = false ∨ fingerprint = true) := by
  cases sameCart <;> cases cartOpen <;> cases fingerprint <;> simp [replay_admissible]
/-- Authentication, recognized scope and an actual grant are necessary and sufficient. -/
theorem scope_exact (auth known owner explicit grant fallback : Bool) :
    scope_admissible auth known owner explicit grant fallback = true ↔
    auth = true ∧ known = true ∧ (owner = true ∨ (explicit = true ∧ grant = true) ∨
      (explicit = false ∧ fallback = true)) := by
  cases auth <;> cases known <;> cases owner <;> cases explicit <;> cases grant <;> cases fallback <;> simp [scope_admissible]
/-- Nonterminal operational edits remain possible. -/
theorem order_edit_exact (terminal : Bool) : order_edit_admissible terminal = true ↔ terminal = false := by
  cases terminal <;> simp [order_edit_admissible]
/-- Ready nonterminal orders can complete. -/
theorem completion_exact (terminal payment deliveries : Bool) :
    completion_admissible terminal payment deliveries = true ↔
    terminal = false ∧ payment = true ∧ deliveries = true := by
  cases terminal <;> cases payment <;> cases deliveries <;> simp [completion_admissible]
/-- Native cancellation is admitted precisely within the business guard. -/
theorem cancellation_exact (terminal external refund deliveries : Bool) :
    cancellation_admissible terminal external refund deliveries = true ↔
    terminal = false ∧ external = false ∧ refund = false ∧ deliveries = true := by
  cases terminal <;> cases external <;> cases refund <;> cases deliveries <;> simp [cancellation_admissible]
/-- Valid native manual payments remain possible. -/
theorem manual_payment_exact (terminal external pending targetPaid : Bool) :
    manual_payment_admissible terminal external pending targetPaid = true ↔
    terminal = false ∧ external = false ∧ pending = true ∧ targetPaid = true := by
  cases terminal <;> cases external <;> cases pending <;> cases targetPaid <;> simp [manual_payment_admissible]
/-- Unblocked paid/simulated orders receive their permitted download. -/
theorem download_exact (blocked paid simulated : Bool) :
    download_admissible blocked paid simulated = true ↔
    blocked = false ∧ (paid = true ∨ simulated = true) := by
  cases blocked <;> cases paid <;> cases simulated <;> simp [download_admissible]
/-- Contact admission preserves both financial and explicitly simulated behavior. -/
theorem checkout_contact_exact (simulated email billing : Bool) :
    checkout_contact_admissible simulated email billing = true ↔
    simulated = true ∨ (email = true ∧ billing = true) := by
  cases simulated <;> cases email <;> cases billing <;> simp [checkout_contact_admissible]
/-- Exact matching receipts are accepted as well as mismatches rejected. -/
theorem receipt_exact_behavior (expected received : Nat) (currency confirmed : Bool) :
    receipt_admissible expected received currency confirmed = true ↔
    expected = received ∧ currency = true ∧ confirmed = true := by
  simp [receipt_admissible, and_assoc]
/-- The rule checks actual customer authentication rather than a supplied guest email. -/
theorem rule_authenticated_exact (present required : Bool) :
    rule_authenticated present required = true ↔ present = required := by
  cases present <;> cases required <;> simp [rule_authenticated]
/-- A guest cannot satisfy the authenticated customer branch. -/
theorem rule_guest_denied : rule_authenticated false true = false := by
  simp [rule_authenticated]
/-- Supported comparison selection exactly preserves all three Boolean operations. -/
theorem rule_comparison_exact (equal empty eq neq isEmpty : Bool) :
    rule_boolean_comparison equal empty eq neq isEmpty = true ↔
    (eq = true ∧ equal = true) ∨ (neq = true ∧ equal = false) ∨ (isEmpty = true ∧ empty = true) := by
  cases equal <;> cases empty <;> cases eq <;> cases neq <;> cases isEmpty <;> simp [rule_boolean_comparison]
/-- Eligibility requires an explicit private mutation capability. -/
theorem app_flow_exact (allowed readOnly isPublic : Bool) :
    app_flow_admissible allowed readOnly isPublic = true ↔
    allowed = true ∧ readOnly = false ∧ isPublic = false := by
  cases allowed <;> cases readOnly <;> cases isPublic <;> simp [app_flow_admissible]
/-- Read-only actions can never become a flow mutation. -/
theorem app_flow_readonly_denied (allowed isPublic : Bool) :
    app_flow_admissible allowed true isPublic = false := by
  cases allowed <;> cases isPublic <;> simp [app_flow_admissible]
/-- Tenant roles and revoked operator grants cannot confer global access. -/
theorem platform_exact (personal granted active : Bool) :
    platform_admissible personal granted active = true ↔
    personal = true ∧ granted = true ∧ active = true := by
  cases personal <;> cases granted <;> cases active <;> simp [platform_admissible]
/-- Bootstrap and integration credentials are never admitted as personal operator sessions. -/
theorem platform_personal_required (granted active : Bool) :
    platform_admissible false granted active = false := by
  cases granted <;> cases active <;> simp [platform_admissible]
/-- GET admission cannot authorize a managed mutation. -/
theorem app_read_safe (readOnly mutating : Bool)
    (h : app_read_admissible readOnly mutating = true) :
    readOnly = true ∧ mutating = false := by
  cases readOnly <;> cases mutating <;> simp_all [app_read_admissible]
/-- The read admission policy accepts exactly declared non-mutating operations. -/
theorem app_read_exact (readOnly mutating : Bool) :
    app_read_admissible readOnly mutating = (readOnly && !mutating) := by rfl

/-- XOR accepts exactly one successful branch, including completeness. -/
theorem rule_xor_exact (hits : Nat) : rule_xor_count hits = true ↔ hits = 1 := by
  simp [rule_xor_count]
/-- Empty and multiple hits cannot masquerade as exclusive OR. -/
theorem rule_xor_empty : rule_xor_count 0 = false := by rfl
/-- Scheduling accepts precisely the documented thirty-day boundary. -/
theorem flow_delay_exact (seconds : Nat) : flow_delay_admissible seconds = true ↔ seconds ≤ 2592000 := by
  simp [flow_delay_admissible]
/-- Country, subdivision, postcode, date and authoritative Rule Builder conditions are all necessary and sufficient. -/
theorem destination_tax_exact (condition country state postal date : Bool) :
    destination_tax_admissible condition country state postal date = true ↔
    condition = true ∧ country = true ∧ state = true ∧ postal = true ∧ date = true := by
  cases condition <;> cases country <;> cases state <;> cases postal <;> cases date <;> simp [destination_tax_admissible]
/-- Unknown groups cannot gain net presentation by claiming a business basis. -/
theorem customer_group_unknown_denied (business : Bool) :
    customer_group_net false business = false := by simp [customer_group_net]
/-- Every configured business basis, and only that basis, selects net presentation. -/
theorem customer_group_net_exact (configured business : Bool) :
    customer_group_net configured business = true ↔ configured = true ∧ business = true := by
  simp [customer_group_net]
/-- Opt-out and current authorization are both necessary and sufficient. -/
theorem app_tool_exact (enabled authorized : Bool) :
    app_tool_admissible enabled authorized = true ↔ enabled = true ∧ authorized = true := by
  cases enabled <;> cases authorized <;> simp [app_tool_admissible]
/-- Explicit opt-out rejects even authorized callers. -/
theorem app_tool_disabled (authorized : Bool) : app_tool_admissible false authorized = false := by
  cases authorized <;> simp [app_tool_admissible]
/-- Personal reference data cannot be public. -/
theorem app_core_reference_private (private_data : Bool) :
    app_core_reference_admissible false private_data = true ↔ private_data = true := by
  cases private_data <;> simp [app_core_reference_admissible]
/-- Exact exposure policy, including legitimate public product content. -/
theorem app_core_reference_exact (product private_data : Bool) :
    app_core_reference_admissible product private_data = (product || private_data) := by rfl
end CommerceKernel
