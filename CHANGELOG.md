# Changelog

## 0.5.0 — prototype release

This release packages the current experimental commerce slice. It is not a
production-readiness or complete Shopware-compatibility claim.

- Modular Rust commerce core and multilingual storefront/Commerce Studio.
- Personal users, independent workspaces, invitations and merchant roles.
- SKU variants, quantity prices, review moderation and configurable demo checkout.
- Durable PostgreSQL storage with Apache AGE and pgvector.
- Merchant-approved proposals, local inference and optional cloud adapters.
- Partial MCP/UCP bindings and bounded Wasm B2B purchase policies.
- Original Shopware pricing/context/tax comparisons and first-start policy fix.
- Versioned app examples, shop intelligence, separate worker roles and a PayPal Sandbox adapter.
- Sandbox verification uses local contract fixtures; live Sandbox traffic is unverified.
- Clear commerce-first quickstart, searchable guides and contributor information.

Payments are simulated, manual or Sandbox; no real money is charged. See [the feature matrix](docs/shopware-parity.md),
[verification record](docs/verification.json) and current CI for exact scope.
