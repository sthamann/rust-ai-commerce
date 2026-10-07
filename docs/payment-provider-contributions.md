# Additional payment providers

Payment proposals are welcome, but adding a method name does not implement a
payment provider. This guide records the integration requirements discussed in
[issue #9](https://github.com/sthamann/vendune/issues/9). These are contribution
requirements, **not a claim that the current app host implements them all**.

## Current boundary

The native `PaymentProvider` trait separates wire calls from the core ledger.
External adapters now register through the versioned [payment provider app
contract](payment-provider-api.md), with declared supported currencies, scoped
onboarding and immutable attempts. [Multi-currency](currencies.md) is resolved
before payment preparation; adapters receive minor units and explicit precision.
A method name or arbitrary service action alone still cannot register settlement
or write payment state. Providers must implement and verify the shared contract.

The existing [checkout contract](checkout.md) and
[payment ledger description](intelligence-apps-payments.md#payment-adapter-and-ledger)
remain authoritative. The private Shopware Payments connector is a separate
integration; another payment rail cannot satisfy that compatibility requirement.

## Requirements for an implementation proposal

Before enabling a payment method, a contribution must define and exercise:

1. **An immutable invoice:** tenant, order, attempt, provider/version, environment,
   recipient, exact amount/unit and any exchange quote/expiry. Currency conversion
   must use exact integer units and an explicit merchant-approved policy.
2. **Server verification:** a trusted, operator-configured provider or node checks
   confirmation, recipient and amount. Browser input, redirects, model output and
   aggregate account balances cannot mark an order paid. Customer-supplied RPC
   URLs must not trigger arbitrary server requests.
3. **Exclusive attribution:** evidence must be assigned to one invoice, with
   atomic duplicate/replay rejection across orders and tenants. A public receipt
   proves a transfer; it does not by itself prove which order paid for it.
   Reconciliation must recover safely after a lost reply or worker restart.
4. **A defined lifecycle:** pending, confirmed, expired, cancelled, underpaid,
   overpaid, late payment, uncertain verification and refund handling. Inventory,
   order events and flows must consume the actual ledger transition exactly once
   locally. Refund destinations require their own verified policy.
5. **Bounded execution and privacy:** isolated provider credentials, timeout and
   retry limits, tenant authorization and safe customer-visible receipts. Public
   ledger data must not cause private order/customer information to be published.
6. **Tests on the real path:** local provider fixtures plus HTTP/PostgreSQL tests
   for confirmation, wrong recipient/amount, forged receipts, replay, foreign
   tenants, races, outages, restart and late payment. An authorized provider-side
   test is required before advertising live support. Pure critical decisions
   follow the existing [formal contract procedure](formal-verification.md).

## Nano / XNO proposal: deferred

We are not adding a first-party Nano method as part of issue #9. A future optional
adapter can be proposed against the requirements above; there is no scheduled
implementation or supported XNO checkout today.

Nano's [`account_info`](https://docs.nano.org/commands/rpc-protocol/#account_info)
returns account-level state, including optional confirmed balance/receivable
fields. It does not identify an invoice payment. Its
[`block_info`](https://docs.nano.org/commands/rpc-protocol/#block_info) response
provides per-block amount, confirmation and state-block subtype. A prospective
adapter would need to verify the expected transfer and recipient, distinguish a
send from a receive, and bind that evidence to its immutable invoice.

Nano's [integration basics](https://docs.nano.org/integration-guides/the-basics/#block-lattice-design)
also distinguish sending funds from receiving them: a sent transfer can remain
receivable until the recipient publishes a receive transaction. An integration
must explicitly define which confirmed evidence it accepts and who performs that
receive operation. Polling a node or subscribing to confirmations is still a
reconciliation mechanism even when no PSP webhook is used.

No wallet custody, onramp integration, node deployment, exchange-rate service or
live transfer has been added or tested. The third-party onramp linked in the issue
is not an endorsed Vendune dependency. A subsequent implementation proposal needs
a runnable adapter and evidence for the lifecycle above.
