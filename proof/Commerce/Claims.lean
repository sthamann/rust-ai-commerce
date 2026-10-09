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
  simp only [refund_admissible, Bool.and_eq_true, decide_eq_true_eq, and_assoc] at h
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
  simp only [refund_admissible, Bool.and_eq_true, decide_eq_true_eq, and_assoc]
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
/-- Review accepts exactly an unchanged revision/amount and confirmed methods; no vacuous rejection. -/
theorem checkout_review_exact (revision methods : Bool) (expected actual : Nat) :
    checkout_review_admissible revision expected actual methods = true ↔
    revision = true ∧ expected = actual ∧ methods = true := by
  simp [checkout_review_admissible, and_assoc]

/-- Exact lifecycle admission includes legitimate reads and settlement; no blanket rejection. -/
theorem shop_availability_exact (active paused read settlement : Bool) :
    shop_request_admissible active paused read settlement = (settlement || active || paused && read) := by rfl
/-- Archived availability cannot admit customer operations or merchant reads, except reconciliation. -/
theorem shop_archived_denied (read : Bool) :
    shop_request_admissible false false read false = false := by
  cases read <;> simp [shop_request_admissible]

/-- Release accepts exactly uncaptured attempts or an explicitly voided authorization. -/
theorem reservation_release_exact (uncaptured authorized voidConfirmed : Bool) :
    reservation_release_admissible uncaptured authorized voidConfirmed = (uncaptured || authorized && voidConfirmed) := by rfl
/-- Uncertain authorizations cannot restore inventory. -/
theorem reservation_authorized_unvoided : reservation_release_admissible false true false = false := by rfl
/-- A later capture cannot be hidden by a void flag. -/
theorem reservation_captured_denied (voidConfirmed : Bool) : reservation_release_admissible false false voidConfirmed = false := by
  cases voidConfirmed <;> simp [reservation_release_admissible]
/-- Every supported precision, and only supported precision, passes the production boundary. -/
theorem currency_scale_exact (scale : Nat) :
    currency_scale_admissible scale = true ↔ scale ≤ 6 := by simp [currency_scale_admissible]
/-- Arbitrarily large input precision cannot pass. -/
theorem currency_scale_overflow_denied (scale : Nat) (h : 6 < scale) :
    currency_scale_admissible scale = false := by simp [currency_scale_admissible]; omega
/-- All and only positive bounded operator quotas are admitted. -/
theorem resource_quota_exact (limit : Nat) :
    resource_quota_admissible limit = true ↔ 0 < limit ∧ limit ≤ 1000000 := by simp [resource_quota_admissible]
theorem resource_quota_zero_denied : resource_quota_admissible 0 = false := by rfl
/-- Full ledger transition relation, including confirmed late capture and refund progression. -/
theorem payment_transition_exact (current next : Nat) :
    payment_transition_admissible current next = true ↔
    current ≤ 9 ∧ next ≤ 9 ∧ (current = next ∨
    (current ≤ 3 ∧ next > current ∧ next ≤ 4) ∨
    (current ≤ 3 ∧ (next = 7 ∨ next = 8)) ∨
    ((current = 4 ∨ current = 5 ∨ current = 9) ∧ (next = 5 ∨ next = 6)) ∨
    ((current = 7 ∨ current = 8) ∧ next = 9)) := by
  simp [payment_transition_admissible, and_assoc, or_assoc]
theorem payment_refunded_terminal (next : Nat) :
    payment_transition_admissible 6 next = true ↔ next = 6 := by
  simp [payment_transition_admissible]; omega
theorem payment_pending_capture : payment_transition_admissible 0 4 = true := by rfl
theorem consent_exact (enabled current fresh chosen : Bool) :
    consent_admissible enabled current fresh chosen = true ↔ enabled = true ∧ current = true ∧ fresh = true ∧ chosen = true := by
  cases enabled <;> cases current <;> cases fresh <;> cases chosen <;> simp [consent_admissible]
theorem legal_checkout_exact (strict current accepted digital immediate : Bool) :
    legal_checkout_admissible strict current accepted digital immediate = true ↔ strict = false ∨ current = true ∧ accepted = true ∧ (digital = false ∨ immediate = true) := by
  cases strict <;> cases current <;> cases accepted <;> cases digital <;> cases immediate <;> simp [legal_checkout_admissible]
/-- Retry admits exactly explicit rate-limit rejection before the eighth attempt. -/
theorem notification_retry_exact (limited : Bool) (attempts : Nat) :
    notification_retry_admissible limited attempts = true ↔ limited = true ∧ attempts < 8 := by
  simp [notification_retry_admissible]
theorem notification_ambiguous_never_retry (attempts : Nat) :
    notification_retry_admissible false attempts = false := by simp [notification_retry_admissible]
/-- All and only clean HTTPS or explicitly admitted HTTP transports pass. -/
theorem app_service_transport_exact (clean secure plain loopback approved : Bool) :
    app_service_transport_admissible clean secure plain loopback approved = true ↔
    clean = true ∧ (secure = true ∨ plain = true ∧ (loopback = true ∨ approved = true)) := by
  cases clean <;> cases secure <;> cases plain <;> cases loopback <;> cases approved <;> simp [app_service_transport_admissible]
theorem app_service_transport_unapproved_denied :
    app_service_transport_admissible true false true false false = false := by rfl
theorem app_service_transport_unsafe_denied (secure plain loopback approved : Bool) :
    app_service_transport_admissible false secure plain loopback approved = false := by rfl
theorem currency_context_exact (enabled configured fresh : Bool) :
    currency_context_admissible enabled configured fresh = true ↔ enabled = true ∧ configured = true ∧ fresh = true := by
  cases enabled <;> cases configured <;> cases fresh <;> simp [currency_context_admissible]
theorem currency_context_stale_denied (enabled configured : Bool) :
    currency_context_admissible enabled configured false = false := by simp [currency_context_admissible]

theorem channel_private_requires_identity (active merchant preview mutating : Bool)
    (h : channel_access_admissible active true merchant preview mutating = true) :
    merchant = true ∨ (preview = true ∧ mutating = false) := by
  cases active <;> cases merchant <;> cases preview <;> cases mutating <;> simp_all [channel_access_admissible]
theorem channel_paused_requires_preview (is_private merchant preview mutating : Bool)
    (h : channel_access_admissible false is_private merchant preview mutating = true) :
    preview = true ∧ mutating = false := by
  cases is_private <;> cases merchant <;> cases preview <;> cases mutating <;> simp_all [channel_access_admissible]
theorem channel_preview_no_mutation (is_private : Bool) :
    channel_access_admissible false is_private false true true = false := by
  cases is_private <;> rfl

theorem channel_access_exact (active is_private merchant preview mutating : Bool) :
    channel_access_admissible active is_private merchant preview mutating =
      ((active && !is_private) || (active && merchant) || (preview && !mutating)) := by
  cases active <;> cases is_private <;> cases merchant <;> cases preview <;> cases mutating <;> rfl

/-- A public-asset optimization cannot bypass admission for a hosted shop. -/
theorem native_asset_hosted_denied (nativeAsset : Bool) :
    native_asset_bypass nativeAsset true = false := by simp [native_asset_bypass]
theorem native_asset_bypass_exact (nativeAsset hosted : Bool) :
    native_asset_bypass nativeAsset hosted = true ↔ nativeAsset = true ∧ hosted = false := by
  cases nativeAsset <;> cases hosted <;> simp [native_asset_bypass]

theorem wasm_resources_exact (tables memories elements pages : Nat) :
    wasm_resources_admissible tables memories elements pages = true ↔
    tables ≤ 1 ∧ memories ≤ 1 ∧ elements ≤ 10000 ∧ pages ≤ 16 := by
  simp [wasm_resources_admissible, Bool.and_eq_true, decide_eq_true_eq, and_assoc]

theorem wasm_tables_bounded (tables memories elements pages : Nat)
    (h : wasm_resources_admissible tables memories elements pages = true) : elements ≤ 10000 := by
  exact (wasm_resources_exact tables memories elements pages).mp h |>.2.2.1

theorem app_package_authority_exact (pinned bundled : Bool) :
    app_package_authorized pinned bundled = true ↔ pinned = true ∨ bundled = true := by
  cases pinned <;> cases bundled <;> simp [app_package_authorized]

theorem app_package_unapproved_denied : app_package_authorized false false = false := by rfl

theorem app_surface_exact (currentPackage allowedAction : Bool) :
    app_surface_admissible currentPackage allowedAction = true ↔ currentPackage = true ∧ allowedAction = true := by
  cases currentPackage <;> cases allowedAction <;> simp [app_surface_admissible]

theorem app_surface_stale_denied (allowedAction : Bool) :
    app_surface_admissible false allowedAction = false := by
  cases allowedAction <;> simp [app_surface_admissible]

theorem app_callback_exact (capability currentRole : Bool) :
    app_callback_admissible capability currentRole = true ↔ capability = true ∧ currentRole = true := by
  cases capability <;> cases currentRole <;> simp [app_callback_admissible]

theorem app_callback_without_consent_denied (currentRole : Bool) :
    app_callback_admissible false currentRole = false := by
  cases currentRole <;> simp [app_callback_admissible]

theorem ai_price_exact (price minimum maximum : Nat) (margin discount brand available : Bool) :
    ai_price_admissible price minimum maximum margin discount brand available = true ↔
    minimum ≤ price ∧ price ≤ maximum ∧ margin = true ∧ discount = true ∧ brand = true ∧ available = true := by
  simp [ai_price_admissible, Bool.and_eq_true, decide_eq_true_eq, and_assoc]

theorem ai_price_locked_denied (price minimum maximum : Nat) (margin discount available : Bool) :
    ai_price_admissible price minimum maximum margin discount false available = false := by
  simp [ai_price_admissible]

theorem ai_autonomy_exact (enabled authorized price_only daily_budget within_delta : Bool) :
    ai_autonomy_admissible enabled authorized price_only daily_budget within_delta = true ↔
    enabled = true ∧ authorized = true ∧ price_only = true ∧ daily_budget = true ∧ within_delta = true := by
  cases enabled <;> cases authorized <;> cases price_only <;> cases daily_budget <;> cases within_delta <;> simp [ai_autonomy_admissible]

theorem ai_autonomy_disabled_denied (authorized price_only daily_budget within_delta : Bool) :
    ai_autonomy_admissible false authorized price_only daily_budget within_delta = false := by
  simp [ai_autonomy_admissible]

theorem claim_render_exact (confirmed public_source current_source valid_time exact_text : Bool) :
    claim_render_admissible confirmed public_source current_source valid_time exact_text = true ↔
    confirmed = true ∧ public_source = true ∧ current_source = true ∧ valid_time = true ∧ exact_text = true := by
  cases confirmed <;> cases public_source <;> cases current_source <;> cases valid_time <;> cases exact_text <;> simp [claim_render_admissible]

theorem claim_unconfirmed_denied (public_source current_source valid_time exact_text : Bool) :
    claim_render_admissible false public_source current_source valid_time exact_text = false := by
  simp [claim_render_admissible]

theorem experiment_result_exact (final_look enough_units positive_bound : Bool) :
    experiment_result_admissible final_look enough_units positive_bound = true ↔
    final_look = true ∧ enough_units = true ∧ positive_bound = true := by
  cases final_look <;> cases enough_units <;> cases positive_bound <;> simp [experiment_result_admissible]

theorem experiment_immature_denied (enough_units positive_bound : Bool) :
    experiment_result_admissible false enough_units positive_bound = false := by
  simp [experiment_result_admissible]

theorem experiment_undersized_denied (final_look positive_bound : Bool) :
    experiment_result_admissible final_look false positive_bound = false := by
  simp [experiment_result_admissible]

end CommerceKernel
