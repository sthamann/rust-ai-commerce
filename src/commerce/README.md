# src/commerce

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`catalog.rs](catalog.rs): SKU loading with parent translation fallback.
- [`configuration.rs](configuration.rs): Tenant checkout configuration loading.
- [`context_routes.rs](context_routes.rs): Public method discovery and revision-checked checkout context changes.
- [`delivery.rs](delivery.rs): Shipping costs, proportional taxes and calendar delivery windows.
- [`detail.rs](detail.rs): Product family, context prices, gallery, properties and review aggregates.
- [`fulfillment.rs](fulfillment.rs): Revision-checked payment and delivery state transitions.
- [`mod.rs](mod.rs): Native catalogue and checkout domains; pricing ports remain in the library.
- [`order_fields.rs](order_fields.rs): Standard order read fields are projected from the authoritative quote/payment, never maintained twice.
- [`order_machine.rs](order_machine.rs): Declarative order workflow schema. Extensions add states, never executable effects or payment truth.
- [`order_workflow.rs](order_workflow.rs): One server-derived action catalogue drives UI, HTTP and MCP; built-in business guards cannot be bypassed.
- [`product_admin.rs](product_admin.rs), [`product_admin.sql`](product_admin.sql): indexed server-filtered list and catalog identity/association writes.
- [`product_channels.rs`](product_channels.rs): product-specific channel visibility overrides.
- [`product_edit.rs](product_edit.rs): Revision-bound multilingual product metadata: specifications, SEO, cross-selling and free shipping.
- [`product_fields.rs](product_fields.rs): Native product administration writes priced fields under the same revision and inventory row lock.
- [`review_moderation.rs](review_moderation.rs): Merchant authorization and review publication.
- [`reviews.rs](reviews.rs): Customer review submission with server-derived purchase verification.
- [`selection.rs](selection.rs): Recover a quote after configuration changes without losing items or silently committing new choices.
- [`settings_mutation.rs](settings_mutation.rs): Optimistic settings persistence and audit event.
- [`settings_routes.rs](settings_routes.rs): Tenant configuration and operational read model.
- [`settings_validation.rs](settings_validation.rs): Configuration validation and required availability invariants.
- [`tax.rs](tax.rs): Destination tax-class resolution and net-preserving price conversion.
- [`types.rs](types.rs): Checkout selection and configuration data contracts.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.

International additions: `geography.rs` catalogue/overlay/address validation;
`tax_rules.rs` guarded destination resolution; `tax_context.rs` authoritative
Rule Builder facts; `settings_defaults.rs` compatibility enrichment;
`method_text.rs` translated methods; `content_text.rs` per-field metadata fallback;
`product_languages.rs` enabled locales and stable registration;
`international_capabilities.rs` native configuration/translation MCP operations.
[The international contract](../../docs/international-commerce.md) names limits
and real PostgreSQL suites. Translation workers live in their own domain folder.
