# src/commerce

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`catalog.rs`](catalog.rs): SKU loading with parent translation fallback.
- [`configuration.rs`](configuration.rs): Tenant checkout configuration loading.
- [`content_text.rs`](content_text.rs): Shared field-level content fallback for metadata and configurable object names.
- [`context_routes.rs`](context_routes.rs): Public method discovery and revision-checked checkout context changes.
- [`customer_groups.rs`](customer_groups.rs): Tenant-owned translated customer groups preserve exact rule IDs and select an explicit existing price/tax presentation basis.
- [`delivery.rs`](delivery.rs): Shipping costs, proportional taxes and calendar delivery windows.
- [`detail.rs`](detail.rs): Product family, context prices, gallery, properties and review aggregates.
- [`fulfillment.rs`](fulfillment.rs): Revision-checked payment and delivery state transitions.
- [`geography.rs`](geography.rs): Bundled MIT country catalogue, tenant-owned overrides and typed region admission.
- [`group_usage.rs`](group_usage.rs): Removing a customer group rejects live customer, price and native/source-rule dependencies under the settings lock.
- [`international_capabilities.rs`](international_capabilities.rs): International configuration and translation MCP tools call the exact same scoped native handlers as HTTP.
- [`method_text.rs`](method_text.rs): Shared translated names and descriptions with field-wise shop-main-language inheritance.
- [`method_usage.rs`](method_usage.rs): Tenant-scoped dependency preflight and authoritative deletion guards; order snapshots remain immutable.
- [`mod.rs`](mod.rs): Native catalogue and checkout domains; pricing ports remain in the library.
- [`order_fields.rs`](order_fields.rs): Standard order read fields are projected from the authoritative quote/payment, never maintained twice.
- [`order_machine.rs`](order_machine.rs): Declarative order workflow schema. Extensions add states, never executable effects or payment truth.
- [`order_workflow.rs`](order_workflow.rs): One server-derived action catalogue drives UI, HTTP and MCP; built-in business guards cannot be bypassed.
- [`product_admin.rs`](product_admin.rs): Central product list and identity/association writes; all persistence is tenant scoped.
- [`product_channels.rs`](product_channels.rs): Per-product channel visibility overrides remain indexed even when an open catalog contains millions of products.
- [`product_edit.rs`](product_edit.rs): Revision-bound multilingual product metadata: specifications, SEO, cross-selling and free shipping.
- [`product_fields.rs`](product_fields.rs): Native product administration writes priced fields under the same revision and inventory row lock.
- [`product_languages.rs`](product_languages.rs): Enabled content languages, NULL field inheritance and stable global language registration.
- [`review_moderation.rs`](review_moderation.rs): Merchant authorization and review publication.
- [`reviews.rs`](reviews.rs): Customer review submission with server-derived purchase verification.
- [`selection.rs`](selection.rs): Recover a quote after configuration changes without losing items or silently committing new choices.
- [`settings_defaults.rs`](settings_defaults.rs): Backward-compatible enrichment of existing configuration with bundled translated method labels.
- [`settings_mutation.rs`](settings_mutation.rs): Optimistic settings persistence and audit event.
- [`settings_patch.rs`](settings_patch.rs): Transport-only sparse JSON differences: stable record IDs, explicit nulls, and deletion distinct from inheritance.
- [`settings_release.rs`](settings_release.rs): Selective staging units for channel settings; all final aggregates and method dependencies use native validators.
- [`settings_routes.rs`](settings_routes.rs): Tenant configuration and operational read model.
- [`settings_scope.rs`](settings_scope.rs): Scoped checkout configuration: basis row lock orders all override writes and authoritative checkout reads.
- [`settings_validation.rs`](settings_validation.rs): Configuration validation and required availability invariants.
- [`tax.rs`](tax.rs): Destination tax-class resolution and net-preserving price conversion.
- [`tax_context.rs`](tax_context.rs): Tax conditions consume private authoritative pre-tax cart facts without a recursive quote.
- [`tax_rules.rs`](tax_rules.rs): Priority-based destination rules; current tax law is merchant configuration, not bundled tax advice.
- [`types.rs`](types.rs): Checkout selection and configuration data contracts.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.

International additions: `geography.rs` catalogue/overlay/address validation;
`tax_rules.rs` guarded destination resolution; `tax_context.rs` authoritative
Rule Builder facts; `settings_defaults.rs` compatibility enrichment;
`method_text.rs` translated methods; `content_text.rs` per-field metadata fallback;
`product_languages.rs` enabled locales and stable registration;
`international_capabilities.rs` native configuration/translation MCP operations.
[The international contract](../../docs/international-commerce.md) names limits
and real PostgreSQL suites. Translation workers live in their own domain folder.

`customer_groups.rs` owns translated group definitions and verified price basis; `group_usage.rs` rejects removing referenced groups. See [entity history](../../docs/entity-history.md).
