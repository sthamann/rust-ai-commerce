# Changelog

## Rust standard services — 7 October 2026

- Ported bundled Email Delivery, GA4, Gmail, Slack and OAuth/export state to an independent Rust service; existing app, Flow Builder and MCP contracts are preserved.
- Replaced local SQLite with encrypted tenant/app-bound PostgreSQL records, forced RLS, distributed lease-fenced claims and per-tenant/app quotas. Ambiguous external delivery is never automatically resent.
- Added compiler-typed mail configuration, verified SMTP STARTTLS/TLS and Resend/SendGrid delivery, atomic offline migration, actual multi-process/provider regressions and the extracted Lean retry predicate.
- Archived the previous Python implementation as a migration comparison oracle. Python remains in development tools and independent app examples, outside the first-party central runtime. See [the architecture and language audit](docs/rust-services.md).

## Vendune identity — October 2026

- Renamed the public repository, Rust crate/binary, frontend package, Docker images, MCP identity and documentation to Vendune.
- Added the original Vendune V/dune vector mark, light/dark wordmarks, shared Studio/operator branding and favicons.
- Preserve existing shop identities, browser sessions and database volumes; fresh installations use Vendune names.
- Recaptured current English README views and added a public-brand consistency check.

## Unified content translation editors

- One shared content-language picker and one field per value across product/SEO,
  attachment, category, tax, method, rule/campaign/channel and graphical flow editing.
- Main-language inheritance for simple and graphical flow instructions and file
  titles, dynamic enabled content locales and localized storefront file labels.
- CI rejects new stacked language fields; regression checks cover preservation,
  explicit blanks, Spanish inheritance, Italian and regional variants.
## 0.5.0 — prototype release

This release packages the current experimental commerce slice. It is not a
production-readiness or complete Shopware-compatibility claim.

- Modular Rust commerce core and multilingual storefront/Vendune Studio.
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
