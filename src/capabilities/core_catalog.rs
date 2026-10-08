//! Public HTTP/MCP capability catalogue, separate from authorization and dispatch.
pub(crate) const CORE: &[(&str, &str)] = &[
    ("currency.list", "Read currencies and FX context"),
    ("currency.select", "Select open-cart currency with revision"),
    ("merchant.currencies.refresh", "Refresh ECB rates"),
    (
        "merchant.currencies.generate",
        "Queue fixed-price generation",
    ),
    ("merchant.currencies.jobs", "List currency jobs"),
    ("merchant.currencies.job", "Read currency job"),
    (
        "privacy.policy",
        "Read effective channel legal documents and consent policy",
    ),
    (
        "privacy.consent",
        "Record affirmative optional-purpose choices for this cart",
    ),
    (
        "legal.accept",
        "Acknowledge current terms and separately requested digital delivery",
    ),
    (
        "legal.request",
        "Submit withdrawal or data-rights declaration without disclosing orders",
    ),
    ("merchant.legal.requests", "Read private consumer requests"),
    (
        "merchant.legal.review",
        "Review consumer request with revision and audit note",
    ),
    (
        "merchant.history",
        "Read scoped entity change summaries; no credential snapshots",
    ),
    (
        "merchant.history.version",
        "Inspect exact before/after entity changes",
    ),
    (
        "merchant.history.restore",
        "Restore reviewed content as a new revision through domain validation; orders excluded",
    ),
    (
        "merchant.customer.groups",
        "Read configured customer groups and their pricing basis",
    ),
    (
        "merchant.media.list",
        "Restore pending and reviewable product image drafts",
    ),
    (
        "merchant.commerce.dependencies",
        "Check method dependencies before removal",
    ),
    (
        "merchant.media.provider",
        "Read optional image-provider availability",
    ),
    (
        "merchant.media.create",
        "Create revision-bound private AI image draft",
    ),
    (
        "merchant.media.detail",
        "Read private image job and review preview",
    ),
    (
        "merchant.media.apply",
        "Publish reviewed image; product gallery save is separate",
    ),
    (
        "merchant.company",
        "Read company basis or one sales channel and its inheritance",
    ),
    (
        "merchant.company.save",
        "Revision-bound structured company identity, legal fields, logo and channel overrides",
    ),
    (
        "merchant.commerce.read",
        "Read countries, tax rules, shipping, payment and content languages",
    ),
    (
        "merchant.commerce.save",
        "Revision-bound international commerce settings update",
    ),
    (
        "merchant.translations.list",
        "Read catalogue translation jobs",
    ),
    (
        "merchant.translations.create",
        "Start an AI catalogue translation draft job",
    ),
    (
        "merchant.translations.detail",
        "Read paginated source and translated product drafts",
    ),
    (
        "merchant.translations.control",
        "Resume or cancel a translation job",
    ),
    (
        "merchant.translations.apply",
        "Apply at most 50 revision-checked translation drafts",
    ),
    (
        "merchant.products",
        "Search/filter own products before cursor pagination",
    ),
    (
        "merchant.product.create",
        "Create a native product or variant with localized content and category/channel associations",
    ),
    (
        "merchant.categories",
        "Read own category tree and translations",
    ),
    (
        "merchant.category.create",
        "Create a localized inactive or active category",
    ),
    (
        "merchant.category.save",
        "Revision-bound category content and cycle-safe parent edit",
    ),
    (
        "automation.catalog",
        "Read original rule scopes and executable native action contracts",
    ),
    (
        "automation.list",
        "Read own rule, promotion and flow definitions and jobs",
    ),
    (
        "automation.save",
        "Revision-bound rule, promotion, channel or flow graph write",
    ),
    (
        "automation.dependencies",
        "Inspect tenant-owned references and durable uses before deletion",
    ),
    (
        "automation.delete",
        "Revision-bound deletion of unused tenant configuration",
    ),
    (
        "automation.preview",
        "Evaluate a rule against an authoritative cart without effects",
    ),
    (
        "automation.import",
        "Validate and normalize an original Shopware condition without saving",
    ),
    (
        "merchant.workflow",
        "Read multilingual state machine and transitions",
    ),
    (
        "merchant.workflow.save",
        "Revision-bound declarative workflow extension",
    ),
    (
        "merchant.product.content",
        "Read enabled-language product content",
    ),
    (
        "merchant.product.save",
        "Revision-bound product content update",
    ),
    (
        "merchant.product.assets",
        "Read asset metadata without binary secrets",
    ),
    ("merchant.asset.publish", "Digest-bound file publication"),
    (
        "merchant.customer.addresses",
        "List owning customer address book",
    ),
    (
        "merchant.customer.address.save",
        "Create/update customer address and defaults with revision",
    ),
    (
        "merchant.customer.address.delete",
        "Delete customer address with revision",
    ),
    ("merchant.customers", "Search tenant customers"),
    ("merchant.customer", "Read customer details"),
    ("merchant.customer.save", "Revision-checked customer update"),
    ("merchant.order", "Read order detail and activity"),
    (
        "merchant.order.transition",
        "Revision-checked order payment or delivery transition",
    ),
    ("merchant.order.note", "Append an operational note"),
    ("merchant.receipts", "Read immutable order receipts"),
    (
        "merchant.receipt.create",
        "Generate a numbered immutable receipt and PDF",
    ),
    (
        "merchant.payment",
        "Explicitly approved idempotent provider command",
    ),
    (
        "merchant.payment.providers",
        "Read installed payment contracts and merchant account readiness",
    ),
    (
        "merchant.payment.onboarding",
        "Approved provider onboarding scoped to merchant and sales channel",
    ),
    (
        "developer.archive",
        "Explicit recoverable App Studio project removal or restore",
    ),
    (
        "developer.builds",
        "Read own immutable app development versions",
    ),
    (
        "developer.import",
        "Import a reviewed declarative package as a draft in a private environment",
    ),
    (
        "developer.stage",
        "Explicitly install a digest-bound app build in a private sandbox",
    ),
    (
        "developer.task",
        "Export an environment-scoped coding-agent task",
    ),
    ("catalog.search", "Read catalog"),
    (
        "catalog.detail",
        "Read SKU family, media, properties, approved reviews and context prices",
    ),
    (
        "checkout.options",
        "Read available shipping and payment methods",
    ),
    (
        "checkout.select",
        "Update country, delivery address, shipping and payment with cart revision",
    ),
    (
        "knowledge.graph",
        "Read tenant product needs and complementary relationships",
    ),
    (
        "knowledge.search",
        "Semantic product retrieval with live price/stock and graph evidence",
    ),
    (
        "knowledge.external",
        "Read merchant-private Gmail/Analytics sources with provenance",
    ),
    (
        "knowledge.product",
        "Read product facts and graph evidence with source scope",
    ),
    (
        "knowledge.workspace",
        "Read tenant-wide knowledge totals, cursor sources, activity and permissions",
    ),
    (
        "knowledge.preview",
        "Preview scoped lexical evidence without provider calls or mutations",
    ),
    (
        "knowledge.source.detail",
        "Read own source content and translations",
    ),
    (
        "knowledge.source.create",
        "Create private enabled-language knowledge source",
    ),
    (
        "knowledge.source.edit",
        "Revision-bound source edit, invalidating embeddings and public review",
    ),
    (
        "knowledge.source.visibility",
        "Explicit revision-bound source publication decision",
    ),
    (
        "knowledge.source.archive",
        "Explicit recoverable source archive or restore",
    ),
    ("cart.create", "Create customer cart"),
    (
        "cart.replace",
        "Replace cart items using optimistic revision",
    ),
    ("cart.quote", "Calculate authoritative cart"),
    (
        "checkout.complete",
        "Place order with simulated/manual payment and Idempotency-Key",
    ),
    (
        "merchant.plan",
        "Create real LLM change preview; merchant authorization required",
    ),
    (
        "merchant.apply",
        "Approve stored change; merchant authorization required",
    ),
    (
        "merchant.orders",
        "Read orders; merchant authorization required",
    ),
];
