# Merchant workbench, knowledge and selective releases

The workbench connects merchant chat, Storyfront, app development and private
shop environments. It is a working prototype with four supported locales:
English (`en-GB`), German (`de-DE`), French (`fr-FR`) and Spanish (`es-ES`).

## One merchant, several shops

Sign in with a personal account. **Team & access → Create shop** also creates
additional independent shops under the same account; the workspace picker shows
current memberships. Products, settings, orders, app records, documents and
observations are scoped to that shop. Membership/role changes apply on the next
request. Customer accounts are separate from merchant accounts.

Shops are tenants. **Sales channels** are storefront/headless catalogs inside one
shop; they share inventory and merchant/customer data. Select the channel using
`sw-sales-channel-id` or `?shop=SHOP&channel=CHANNEL` in the prototype frontend.
Each channel defines admitted locales and products; variants inherit visibility
from their parent. A cart is bound to its channel, including checkout handoff.
Channel IDs do not grant merchant authorization.

## Develop and release an app

1. Open **Environments**, name a private sandbox and create it.
2. Open **Developers**, choose that sandbox, provider and model, and describe the
   feature. Local Ollama, OpenAI API and Anthropic API use the same structured
   generation contract. Providers need operator-configured credentials.
3. Inspect the generated manifest, four-language labels, version and SHA-256.
   Generation saves an immutable draft; it does not install or publish it.
4. Choose **Install in staging**. The manifest creates actual typed app tables,
   authorized API actions and native admin/storefront slots in that private shop.
5. Select the sandbox in the workbench header. Use **Apps & payments** to edit
   app records, and **Preview** to inspect its shopper UI.
6. Return to **Environments**. Review before/after data, select exact changes and
   publish. App installation and individual app records are separate selections.

Codex and Claude Code can use the exported task, schema and local MCP bridge.
`developer.builds`, `developer.import`, `developer.stage` and `developer.task`
are exposed only to permitted merchant roles. Set `COMMERCE_SESSION_TOKEN`
locally in the client configuration; exported tasks contain a placeholder, never
credentials. Run the exported helper from a local repository checkout;
`COMMERCE_PUBLIC_ORIGIN` selects the HTTPS backend for deployed installations.
The developer tab does not log into a consumer ChatGPT/Claude
account or run arbitrary shell code. Model API integration and external coding
client integration are distinct mechanisms.

The generated runtime supports declarative entities, translated string fields,
string/integer/boolean validation, native forms/lists and list/save actions.
Existing Wasm and service apps remain supported by the general app system;
arbitrary source compilation, destructive migrations, custom React components,
Git commits and deployment of new service executables require an external build.
Database versions/digests are immutable and exportable JSON, not a hosted Git IDE.

## What a sandbox contains

A sandbox clones product content/translations/metadata, commerce settings,
experience configuration, rules, campaigns, flows, channels, declarative apps,
public app records and source documents/chunks. It has a separate tenant ID and
inherits access from current live-shop memberships. Anonymous APIs and checkout
are rejected. External service calls and app payment methods are disabled.

Inventory is a simulation copy. Live customers, orders, payment credentials,
payment attempts, behavior signals and learned order observations are excluded.
Publishing a product preserves live inventory. Private app records are not copied
because arbitrary app records can contain customer or order data. The prototype rejects cloning or snapshotting an app entity with more than 1,000 public records; it never silently truncates a release.

Selectable units are `product:ID`, `app:ID`, `appdata:APP:ENTITY:RECORD`,
`document:ID`, `rule:ID`, `promotion:ID`, `flow:ID`, `channel:ID`, `settings` and
`experience`. The entire selected release is transactional. Staged digests and
current live content are checked against the baseline; a conflicting live edit
rejects the release. A release receipt records actor, selections and time.
No partial success is silently reported. Product creation/deletion, destructive
schema changes, automatic conflict merging and one-click rollback are outside
this release contract. A new sandbox can be created after a conflict.

## Product knowledge and intelligence

**Shop knowledge** accepts UTF-8 text through an API or file upload, and
searchable PDFs up to 2 MiB. The parser runs in a credential-free child with
CPU/time limits (and a 512 MiB address-space limit on Linux); no OCR is provided. macOS does not support this finite address-space limit. This is bounded process isolation,
not a microVM or protection against every parser vulnerability.

Documents are private initially. An explicit revision-bound publication makes a
source available to product questions. Content hashes, chunks and actual AGE
`Product → HAS_DOCUMENT → Document` relations retain provenance. Published
relations are shown in the knowledge view. Private source content is excluded
from customer retrieval. A source can also be prepared/published through a
selected staging release.

A customer asks a question on the product detail page. The model receives the
current product snapshot and up to eight eligible chunks. Retrieval merges
lexical and optional local pgvector similarity ranks; an unavailable embedding
service falls back to lexical search. The answer returns validated source IDs,
exact excerpts and hashes. Unsupported claims/citations are rejected where
structurally detectable; factual answer quality still depends on the model.

The LLM's weights remain fixed. Intelligence comes from persisted sources,
observations, approved associations, bounded context, proposals and actual
consumer paths. **Personalization** is a shopper toggle: owned-cart view signals
update an anonymous shop/session affinity profile; ranked, available channel
products immediately change order within bounded candidate pages (at most 100). Events are deduplicated, bounded and can be
cleared. This is category affinity, not demonstrated causal sales uplift or
universal hyper-personalization. Shipping and price are recalculated by the core.

## Rules, flows, campaigns and customers

**Automation** has separate rule, promotion, flow and channel forms, plus an
editable JSON contract for nested conditions. Numeric comparisons use the ported
Shopware epsilon/null semantics. Supported conditions include boolean containers,
cart amount/line count, customer group/login, country, channel and product IDs.
Campaigns support percentage/fixed discounts, coupons, automatic application,
free shipping, priority/exclusivity, time windows and global usage limits.
Discount allocation conserves integer cents; tax is recalculated. Usage is
recorded in the order transaction, including concurrent checkout protection.

Flows consume actual order/payment outbox events and evaluate conditions. They
create a localized shop note or a stored AI change proposal. AI proposals appear
in the workbench and require merchant approval before mutation. Durable jobs
prevent normal duplicate processing; a lost inference result becomes uncertain
instead of being blindly repeated. Actor revocation blocks execution. Arbitrary
flow actions, email delivery, full Shopware flow catalogs, nested delayed flows,
per-customer coupons, promotion set-group/filter calculators and full upstream
Rule/Flow Builder interchange are not implemented.

Shopper accounts support registration, login/logout, name/address editing,
password changes and own order history. New carts reuse the customer's trusted
identity/group. Customers cannot self-assign a group; history excludes reusable
cart tokens. Email changes/verification/recovery and account deletion still need
production identity work.

Product metadata supports four-language names/descriptions, SEO metadata,
translated specifications, cross-selling IDs and a free-shipping flag consumed
by checkout. Existing SKU quantity prices and delivery timing remain shared
between detail and cart. SEO slugs are metadata, not yet separate server-rendered
routes; full Shopware advanced-price/currency inheritance remains a bounded port.

## Verification

- `scripts/staging.py`: private scope, typed apps/records, selected releases,
  conflicting live versions and role/cross-shop denial.
- `scripts/developer_documents.py`: actual OpenAI/Anthropic protocol adapters
  using local fixtures, generated app tables/slots, document publication,
  semantic retrieval consumer, PDF parsing and order-triggered AI approval.
- `scripts/marketing_accounts.py`: additional shops, customer authority/history,
  concurrent limited coupons, tax/free shipping, order flows, channels,
  metadata/document releases and persisted personalization.
- `scripts/rule_differential.py`: 1,280 comparisons with the pinned original PHP.
- `frontend/tests/locales.mjs`: equal nonempty locale dictionaries and translated
  transport errors; strict frontend build covers typed component contracts.

Fixtures verify protocol/authority/consumer behavior, not real-model quality.
See [the feature matrix](shopware-parity.md), [source map](source-map.md) and
[deployment preparation](deployment.md) for implementation and remaining work.

## Verified local-model walkthrough

In a real local Qwen run, a prompt generated the Product Care app, with a typed
`guides` entity, list/save APIs, four-language labels and a product-detail slot.
The merchant saved care instructions in all four locales, then selected only the
app and its record for publication. Both the parent mug and the 500 ml variant
rendered the published care instructions. A separate German PDP question was
answered correctly with dishwasher suitability and the selected 500 ml capacity.
This demonstrates those concrete paths; it does not measure general model quality.

The independent Storyfront connector imports all root/variant pages up to its
explicit 250-product prototype cap, and the existing names/descriptions in all
four languages. Imported translations are source facts, not generated guesses.
Storyfront's broader scene/chrome localization belongs to its separate frontend;
this workbench does not automatically translate old generated stories.
