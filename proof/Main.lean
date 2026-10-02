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
