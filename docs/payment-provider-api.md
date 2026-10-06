# Payment providers · API 1

Payment apps declare their methods in the same versioned manifest edited in App Studio and produced by coding agents. The public core owns tenant/customer authorization, authoritative EUR-cent invoices, immutable attempts, reservations, durable jobs, refund admission, verified receipts and order events. An isolated provider owns onboarding, provider-specific conversion, credentials and PSP calls. Shopware Payments implementations and partner attribution live exclusively in the private connector repository.

## Package and account lifecycle

Use `runtime: service`, `category: payment`, `permissions: [payments.provider]` and `paymentProvider: {apiVersion: "1", methods: [...]}`. Each method defines `id`, localized `name`, `currencies`, `countries` (empty means unrestricted), `capabilities`, `intent` (`capture` or `authorize`) and `checkout` (`redirect` or `embedded`). Supported declared capabilities are capture, authorize, void, refund, vault and recurring; the last two are discovery declarations, **not** a general subscription engine or finished provider implementation. Reserved core identities cannot register as external providers.

[The neutral example](../extensions/apps/payment-provider/manifest.json) runs against the local synthetic service in `scripts/payment_providers.py`. It does not implement Stripe or another PSP. A Stripe service can use the same boundary with its own real SDK and webhook verification; no core switch statement or Stripe secrets in the public frontend are required.

1. Install the immutable package through `POST /api/apps`. Its methods enter Settings inactive; installing a package cannot start collecting money.
2. Configure a private versioned service on the operator's server. Tenant and model input cannot choose its URL or credential.
3. App Studio → Payments chooses the business country, sales channel and test/live environment. `POST /api/payment-providers/{app}/onboarding` accepts `operation: start|status|disconnect`, channel, optional environment, country, approve and a bounded requestKey. Mutations require `payments.manage` and approval. The provider must echo exact provider/version/tenant/channel/environment identity, opaque accountRef, ready, status and enabled method IDs. Returned URLs require an operator-approved HTTPS origin. No arbitrary provider payload, credentials or company identity is forwarded to the merchant/model.
4. Activate ready methods in Settings → Payment methods. Checkout discovery hides disconnected/uninstalled methods. Readiness is rechecked transactionally at order creation. A channel-specific connection overrides the default, including an explicitly disconnected override.

`GET /api/payment-providers` lists installed contracts and this tenant's account bindings. Onboarding does not trust a browser-supplied merchant ID. A private service must establish that mapping from verified provider evidence.

## Operator configuration

Supply the following shape through a secret store as `PAYMENT_SERVICES`. Tokens below are placeholders; never commit real credentials:

```json
{
  "my_provider": {
    "1.0.0": {
      "defaultEnvironment": "sandbox",
      "sandbox": {
        "url": "https://payments.example.test",
        "token": "REPLACE_WITH_A_PRIVATE_SERVICE_CREDENTIAL",
        "environment": "sandbox",
        "approvalOrigins": ["https://payments.example.test", "https://approved-psp.example.test"]
      },
      "live": {
        "url": "https://payments.example.test",
        "token": "REPLACE_WITH_A_SEPARATE_PRIVATE_CREDENTIAL",
        "environment": "live",
        "approvalOrigins": ["https://payments.example.test", "https://approved-psp.example.test"]
      }
    }
  }
}
```

Retain old versions/environments until all attempts settle, expire, refund and finish their retention period. Existing flat version entries remain compatible. Changing a channel's current account does not rewrite previous attempts. HTTPS, exact environment, bounded bodies, a 15-second timeout, shared connections without redirects and tenant/provider concurrency limits apply. Explicit loopback HTTP is accepted only for `contract-fixture`. Private staging tenants cannot call external payment services.

## Provider RPC and receipt boundary

The core sends `POST /v1/onboarding` or `POST /v1/payments/execute` to the configured service with its bearer credential and derived `x-tenant`. Execute contains API/provider/adapter version, tenant, attemptId, orderId, immutable environment/accountRef/method/intent/capabilities/channel, amountMinor, currency, provider reference/capture ID, operation, stable requestKey, input, authoritative order snapshot and return/cancel URLs. Cart bearer tokens are removed. Operations are create, reconcile, capture, authorize, void, cancel, refund and checkout_session. Provider recovery must reuse request keys and inspect remote state after lost responses.

All financial replies echo the immutable identity and invoice plus a bounded provider reference. Provider-neutral states:

| State | Required evidence |
| --- | --- |
| ready / pending | Matching identity and reference; approved HTTPS URL if present |
| approved | `confirmed: true`; automatically queues the frozen intent |
| authorized | `confirmed: true`, exact authorizedAmountMinor, authorizationId and declared authorize capability |
| captured | `confirmed: true`, exact settledAmountMinor and captureId |
| voided / cancelled | Confirmed provider state; an existing authorization requires void evidence before releasing inventory |
| refunded | Confirmed exact `refund: {id, amountMinor, currency}` for the queued refund |
| refund_pending | Does not change the refund balance; retry the same operation and poll the original provider refund |

The core enforces global provider/environment/account receipt allocation, immutable capture IDs, serial bounded refund admission and once-only stock restoration. Unknown, mismatched or reused receipts cannot partially update the ledger. Lost or malformed results remain visible as uncertain jobs. A late verified capture after release is marked `captured_late` for review. Browser messages, redirects and general app responses never mark an order paid.

## Embedded checkout and subdomains

`GET /store-api/payments/{attempt}/session?parentOrigin=...` requires the owning cart context token. A parent must be the configured commerce origin or the tenant's owned shop/channel subdomain. The provider returns `uiUrl`, scoped sessionToken, matching nonce and expiresIn (maximum 600 seconds). UI and shop must have separate origins; the UI origin must be approved in operator configuration.

The checkout iframe receives only the scoped token and nonce via an exact-origin message. Parent messages require the exact frame window, origin and nonce. `vendune.payment.changed` requests server reconciliation; `vendune.payment.redirect` may navigate only to the already server-approved URL. The private service independently validates the bound parent. An actual provider frontend can implement hosted card fields, wallets or additional fields without obtaining a commerce merchant token. Customer secrets remain with the provider.

## Admin, MCP, flows and events

Merchant HTTP and `merchant.payment` MCP enqueue the same jobs with `payments.manage`; read access uses `payments.read`. Order detail supports authorization capture/void and refunds. `merchant.payment.providers` and `merchant.payment.onboarding` share the account endpoints.

A private app action with handler `payment_command`, `payments.manage`, a payment contract and `flowAllowed: true` lets Flow Builder queue provider-bound commands. Input contains operation, requestKey, approve, optional amountMinor and either attemptId or the authoritative order event. Permission checks are repeated at execution. `payment_onboarding` is deliberately unavailable to flows. Visual/agent-generated payment apps include these shared declarations; actions cannot target another provider's attempts.

Core order/payment events contain the actual provider and environment. `payment.captured` is emitted only after verified ledger admission. Provider-specific webhook authentication belongs to the private service. It forwards a signed notification to `POST /store-api/payment-providers/{app}/webhooks` with x-tenant, x-payment-timestamp and HMAC-SHA256 x-payment-signature over `timestamp + '.' + raw JSON body`, using that version/environment's service credential. Matching notifications are deduplicated and only queue reconciliation; their payload is not settlement evidence.

## Evidence and limits

Real HTTP/PostgreSQL tests cover the neutral provider, existing native PayPal behavior, immutable upgrades, capture/refund/authorization/void, hostile onboarding identities/URLs, receipt reuse, signed callbacks, disconnected discovery, ownership and MCP/app actions. Frontend tests exercise agent/visual manifest round trips and forged iframe messages. A new extracted Lean policy proves the exact stock-release decision; SQL, async execution, provider code, SDKs, browser behavior and the transport remain outside that proof.

Private Shopware Payments tests additionally execute its Rust service with the public core, PayPal-shaped local wire responses, source-derived onboarding, hosted subdomain sessions, signed callback delivery, pending refund recovery and private process restart. These are **local synthetic contract tests**, not successful real PSP transactions. Merchant eligibility, partner credentials, wallet domain registration and observed Sandbox/Live outcomes are separate requirements. The current core is EUR-only. Multi-currency, general subscriptions/vaulting, multi-capture and every original provider management feature are not implied by this interface.
