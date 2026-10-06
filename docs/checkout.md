# One-page checkout and payment boundary

Customers edit contact, structured billing/shipping addresses, delivery and
payment in one page. Existing customer accounts and saved default addresses
continue to work. The summary uses actual product media and authoritative tax,
promotions, delivery and total from the Rust cart calculator.

**Review order** saves the selection and displays the server quote. **Place order**
is a separate explicit action. A cart change invalidates the review; unsaved
address edits survive quantity/coupon updates. Native form validation, visible
errors, pending-state locks and small-screen layout cover the browser path.
This is implemented behavior, not a measured conversion advantage over Shopify.

## API contract

`POST /store-api/checkout/order` can bind its review using both
`x-commerce-cart-revision` and `x-commerce-total-minor` (integer cents). Vendune's
storefront always sends the pair with the cart token and stable cart-specific
idempotency key. Partial, malformed, negative, stale or changed reviews fail
before order/inventory writes. Already committed replay returns the original
order, even when its old quote headers are replayed. Both headers absent preserves
legacy headless clients; it is not a core-wide mandatory review claim.

Method candidate lists allow changing destination in one page. Their `countries`
restrictions are UI hints; the server independently validates actual availability.
Tenant/channel/cart ownership, stock, contact and authoritative pricing remain
server controlled. The exact pure review predicate is Lean-checked; surrounding
SQL, pricing, UI and provider networking are not proved by that theorem.

## Native PayPal flow

Configured accounts use Orders v2 Sandbox or Live with private server-only
credentials and explicit `bnCode`. No vendor attribution is chosen by a public
fallback. Live requires a valid HTTPS commerce origin. Return/cancel URLs retain
shop and sales channel, never the cart token. The original browser's cart token
is still needed; arbitrary cross-device recovery is not implemented.

The browser hands off to the provider. A return asks for reconciliation; neither
an `approved` URL parameter nor a browser button can mark payment complete.
Only verified remote APPROVED state queues a durable capture. Worker leases,
idempotency, remote reconciliation and exact amount/currency/merchant receipt
checks protect the existing ledger. The customer sees verified completion or an
explicit uncertain state with recovery, without a technical capture button.
Polling is bounded and non-overlapping; terminal states stop it.

## Private Shopware Payments connector

The separate private repository is `sthamann/vendune-shopware-payments`.
It currently establishes the proprietary attribution/source boundary, not a
working Shopware Payments network adapter. The official standalone API/SDK,
onboarding agreement and Vendune-authorized test account are still required.
Do not relabel the native PayPal adapter as Shopware Payments or invent endpoints.
Vendor implementation and authorized codes remain private; the public core keeps
generic commerce/payment contracts.

Already released migration 016 and public Git history cannot become private
retroactively. Additive migration 039 removes the SQL attribution default;
existing attempt snapshots remain intact for reconciliation/refunds.

## Verification

`frontend/tests/unit/checkout.test.tsx` checks quote review, preserved drafts,
validation, amount/revision transport, failed review, StrictMode return/recovery
and terminal polling. `scripts/checkout_review.py` exercises real PostgreSQL/HTTP
rejections, unchanged stock/orders, tenant ownership and committed replay.
`scripts/payments.py` uses a local wire provider for forged return, automatic
approval capture, lost reply, refunds, webhook verification and restart.

No actual PSP transaction or live-money charge is claimed. Accelerated wallets,
advanced cards, vaulting, authorize/void, disputes and full original payment parity
remain open. Mobile/browser checks use synthetic fixtures without paid AI calls.
