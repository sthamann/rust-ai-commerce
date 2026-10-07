import Commerce.Generated
import Lean.Data.Json
open Lean CommerceKernel

def evalRequest (j : Json) : Except String Json := do
  let name ← (j.getObjVal? "function") >>= Json.getStr?
  let args ← j.getObjVal? "args"
  match name with
  | "discount_cap" => pure (toJson (discount_cap ((← (args.getObjVal? "total") >>= Json.getNat?)) ((← (args.getObjVal? "requested") >>= Json.getNat?))))
  | "stock_admissible" => pure (toJson (stock_admissible ((← (args.getObjVal? "stock") >>= Json.getNat?)) ((← (args.getObjVal? "quantity") >>= Json.getNat?))))
  | "refund_admissible" => pure (toJson (refund_admissible ((← (args.getObjVal? "captured") >>= Json.getNat?)) ((← (args.getObjVal? "refunded") >>= Json.getNat?)) ((← (args.getObjVal? "requested") >>= Json.getNat?))))
  | "revision_admissible" => pure (toJson (revision_admissible ((← (args.getObjVal? "current") >>= Json.getNat?)) ((← (args.getObjVal? "expected") >>= Json.getNat?))))
  | "replay_admissible" => pure (toJson (replay_admissible ((← (args.getObjVal? "same_cart") >>= Json.getBool?)) ((← (args.getObjVal? "cart_open") >>= Json.getBool?)) ((← (args.getObjVal? "same_fingerprint") >>= Json.getBool?))))
  | "scope_admissible" => pure (toJson (scope_admissible ((← (args.getObjVal? "authenticated") >>= Json.getBool?)) ((← (args.getObjVal? "known_scope") >>= Json.getBool?)) ((← (args.getObjVal? "owner") >>= Json.getBool?)) ((← (args.getObjVal? "explicit") >>= Json.getBool?)) ((← (args.getObjVal? "explicit_grant") >>= Json.getBool?)) ((← (args.getObjVal? "default_grant") >>= Json.getBool?))))
  | "order_edit_admissible" => pure (toJson (order_edit_admissible ((← (args.getObjVal? "terminal") >>= Json.getBool?))))
  | "completion_admissible" => pure (toJson (completion_admissible ((← (args.getObjVal? "terminal") >>= Json.getBool?)) ((← (args.getObjVal? "payment_ready") >>= Json.getBool?)) ((← (args.getObjVal? "deliveries_ready") >>= Json.getBool?))))
  | "cancellation_admissible" => pure (toJson (cancellation_admissible ((← (args.getObjVal? "terminal") >>= Json.getBool?)) ((← (args.getObjVal? "external_payment") >>= Json.getBool?)) ((← (args.getObjVal? "refund_required") >>= Json.getBool?)) ((← (args.getObjVal? "deliveries_open") >>= Json.getBool?))))
  | "manual_payment_admissible" => pure (toJson (manual_payment_admissible ((← (args.getObjVal? "terminal") >>= Json.getBool?)) ((← (args.getObjVal? "external_payment") >>= Json.getBool?)) ((← (args.getObjVal? "current_pending") >>= Json.getBool?)) ((← (args.getObjVal? "target_paid") >>= Json.getBool?))))
  | "download_admissible" => pure (toJson (download_admissible ((← (args.getObjVal? "order_blocked") >>= Json.getBool?)) ((← (args.getObjVal? "paid") >>= Json.getBool?)) ((← (args.getObjVal? "simulated_authorized") >>= Json.getBool?))))
  | "checkout_contact_admissible" => pure (toJson (checkout_contact_admissible ((← (args.getObjVal? "simulated") >>= Json.getBool?)) ((← (args.getObjVal? "email_present") >>= Json.getBool?)) ((← (args.getObjVal? "billing_present") >>= Json.getBool?))))
  | "receipt_admissible" => pure (toJson (receipt_admissible ((← (args.getObjVal? "expected") >>= Json.getNat?)) ((← (args.getObjVal? "received") >>= Json.getNat?)) ((← (args.getObjVal? "same_currency") >>= Json.getBool?)) ((← (args.getObjVal? "confirmed") >>= Json.getBool?))))
  | "rule_authenticated" => pure (toJson (rule_authenticated ((← (args.getObjVal? "customer_present") >>= Json.getBool?)) ((← (args.getObjVal? "required") >>= Json.getBool?))))
  | "rule_boolean_comparison" => pure (toJson (rule_boolean_comparison ((← (args.getObjVal? "equal") >>= Json.getBool?)) ((← (args.getObjVal? "empty") >>= Json.getBool?)) ((← (args.getObjVal? "eq") >>= Json.getBool?)) ((← (args.getObjVal? "neq") >>= Json.getBool?)) ((← (args.getObjVal? "is_empty") >>= Json.getBool?))))
  | "app_flow_admissible" => pure (toJson (app_flow_admissible ((← (args.getObjVal? "allowed") >>= Json.getBool?)) ((← (args.getObjVal? "read_only") >>= Json.getBool?)) ((← (args.getObjVal? "is_public") >>= Json.getBool?))))
  | "platform_admissible" => pure (toJson (platform_admissible ((← (args.getObjVal? "personal") >>= Json.getBool?)) ((← (args.getObjVal? "granted") >>= Json.getBool?)) ((← (args.getObjVal? "active") >>= Json.getBool?))))
  | "app_read_admissible" => pure (toJson (app_read_admissible ((← (args.getObjVal? "read_only") >>= Json.getBool?)) ((← (args.getObjVal? "mutating") >>= Json.getBool?))))
  | "rule_xor_count" => pure (toJson (rule_xor_count ((← (args.getObjVal? "hits") >>= Json.getNat?))))
  | "flow_delay_admissible" => pure (toJson (flow_delay_admissible ((← (args.getObjVal? "seconds") >>= Json.getNat?))))
  | "destination_tax_admissible" => pure (toJson (destination_tax_admissible ((← (args.getObjVal? "condition") >>= Json.getBool?)) ((← (args.getObjVal? "country") >>= Json.getBool?)) ((← (args.getObjVal? "state") >>= Json.getBool?)) ((← (args.getObjVal? "postal") >>= Json.getBool?)) ((← (args.getObjVal? "date") >>= Json.getBool?))))
  | "customer_group_net" => pure (toJson (customer_group_net ((← (args.getObjVal? "configured") >>= Json.getBool?)) ((← (args.getObjVal? "business") >>= Json.getBool?))))
  | "app_tool_admissible" => pure (toJson (app_tool_admissible ((← (args.getObjVal? "enabled") >>= Json.getBool?)) ((← (args.getObjVal? "authorized") >>= Json.getBool?))))
  | "app_core_reference_admissible" => pure (toJson (app_core_reference_admissible ((← (args.getObjVal? "product") >>= Json.getBool?)) ((← (args.getObjVal? "private_data") >>= Json.getBool?))))
  | "checkout_review_admissible" => pure (toJson (checkout_review_admissible ((← (args.getObjVal? "revision_matches") >>= Json.getBool?)) ((← (args.getObjVal? "expected_total") >>= Json.getNat?)) ((← (args.getObjVal? "actual_total") >>= Json.getNat?)) ((← (args.getObjVal? "methods_confirmed") >>= Json.getBool?))))
  | "shop_request_admissible" => pure (toJson (shop_request_admissible ((← (args.getObjVal? "active") >>= Json.getBool?)) ((← (args.getObjVal? "paused") >>= Json.getBool?)) ((← (args.getObjVal? "read_only") >>= Json.getBool?)) ((← (args.getObjVal? "settlement") >>= Json.getBool?))))
  | "reservation_release_admissible" => pure (toJson (reservation_release_admissible ((← (args.getObjVal? "uncaptured") >>= Json.getBool?)) ((← (args.getObjVal? "authorized") >>= Json.getBool?)) ((← (args.getObjVal? "void_confirmed") >>= Json.getBool?))))
  | "currency_context_admissible" => pure (toJson (currency_context_admissible ((← (args.getObjVal? "enabled") >>= Json.getBool?)) ((← (args.getObjVal? "configured") >>= Json.getBool?)) ((← (args.getObjVal? "fresh") >>= Json.getBool?))))
  | "currency_scale_admissible" => pure (toJson (currency_scale_admissible ((← (args.getObjVal? "scale") >>= Json.getNat?))))
  | "payment_transition_admissible" => pure (toJson (payment_transition_admissible ((← (args.getObjVal? "current") >>= Json.getNat?)) ((← (args.getObjVal? "next") >>= Json.getNat?))))
  | "resource_quota_admissible" => pure (toJson (resource_quota_admissible ((← (args.getObjVal? "limit") >>= Json.getNat?))))
  | "consent_admissible" => pure (toJson (consent_admissible ((← (args.getObjVal? "enabled") >>= Json.getBool?)) ((← (args.getObjVal? "current") >>= Json.getBool?)) ((← (args.getObjVal? "fresh") >>= Json.getBool?)) ((← (args.getObjVal? "chosen") >>= Json.getBool?))))
  | "legal_checkout_admissible" => pure (toJson (legal_checkout_admissible ((← (args.getObjVal? "strict") >>= Json.getBool?)) ((← (args.getObjVal? "current") >>= Json.getBool?)) ((← (args.getObjVal? "accepted") >>= Json.getBool?)) ((← (args.getObjVal? "digital") >>= Json.getBool?)) ((← (args.getObjVal? "immediate") >>= Json.getBool?))))
  | "notification_retry_admissible" => pure (toJson (notification_retry_admissible ((← (args.getObjVal? "rate_limited") >>= Json.getBool?)) ((← (args.getObjVal? "attempts") >>= Json.getNat?))))
  | "app_service_transport_admissible" => pure (toJson (app_service_transport_admissible ((← (args.getObjVal? "clean_url") >>= Json.getBool?)) ((← (args.getObjVal? "https") >>= Json.getBool?)) ((← (args.getObjVal? "http") >>= Json.getBool?)) ((← (args.getObjVal? "loopback") >>= Json.getBool?)) ((← (args.getObjVal? "private_origin") >>= Json.getBool?))))
  | _ => throw "Unknown policy"

def main : IO Unit := do
  let input ← IO.getStdin
  let output ← IO.getStdout
  repeat
    let line ← input.getLine
    if line.isEmpty then break
    let result := Json.parse line >>= evalRequest
    match result with
    | .ok value => output.putStrLn value.compress
    | .error reason => throw (IO.userError reason)
