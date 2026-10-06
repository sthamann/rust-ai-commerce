# Product editing, integration keys and sales channels

## One commerce backend

The browser renders React interfaces. Prices, tax, inventory, orders, permissions,
app actions and knowledge writes run in the Rust server. Both the local bundled
frontend and `https://app.vendune.ai/` use relative, same-origin API requests; the
prepared Vercel deployment forwards the same paths to the Rust origin.

```text
Storefront → Store API ─┐
Studio     → Admin API ├→ authentication / tenant + channel context → native domain operations → PostgreSQL + outbox
Agents     → MCP / UCP ┤                                                                    → workers / graph projections
Apps       → actions ──┘
```

Studio requests use `Authorization: Bearer <personal session or integration key>`,
`x-tenant` and `x-commerce-locale`. Customer requests use `sw-context-token`,
`x-tenant`, `sw-sales-channel-id` and the selected locale. The headers select a
context; they do not grant access. Authentication resolves active membership,
scopes and object ownership on the server. Customers cannot access another
customer's addresses or orders by changing IDs. Sales channels share a tenant;
unrelated SaaS merchants require separate tenants.

## Studio login and session expiry

Studio uses a personal merchant session. Without one, any protected tab goes to
`#login`, with its shop/tab/entity target retained in the current same-origin
URL. Stored credentials are verified before mounting protected views. Public
product pages, browsing and checkout remain publicly accessible.

After a verified session expires or is revoked, a blocking native login dialog
opens over the current page. The private workspace becomes inert and later
merchant operations using the rejected token are paused. Unsaved inputs, the
selected entity and staging context stay in memory. Signing in with the same
account and current shop membership resumes the page; logging into a different
account cannot reveal the previous editor. **Leave Studio** discards its private
in-memory state and returns to login. Reloading the page also loses in-memory
drafts, as before. Failed writes are **not automatically replayed**.

Visible sessions are checked every minute and when browser focus/visibility
returns. A server 401 triggers the dialog immediately on the next authenticated
operation. A 403 for insufficient rights, an unavailable network or a rejected
external provider does not invalidate the merchant session. This frontend
boundary improves navigation; server-side tenant, ownership and permission
checks remain the security boundary for API and MCP clients.

## Developer → API & integrations

Create a named integration key with explicit scopes and a lifetime of **1–90 days
from creation**. It is bound to that live shop and its owned staging contexts,
not every shop of the same person. It can never grant more than the creator's
current membership, including after demotion. Revocation takes effect on the
next request. Key management requires `team.manage` and a personal account.
The plaintext key is shown once, masked in the UI, and only held in component
memory. Store it in your integration's secret manager. Scheduled future start
dates and refresh-token rotation are not implemented.

The explorer lists **204 static HTTP method/path pairs** with their Rust source
module. `scripts/api_catalogue.py` regenerates this list from `.route`
declarations; the mandatory CI structure check rejects drift. Installed app `apiRoutes` are
loaded separately for the current shop. This is not a complete OpenAPI schema;
request/response schemas remain in the domain contracts and app manifests.
Select a GET endpoint, fill its parameters and run it against the current shop.
Browser MCP validates `COMMERCE_PUBLIC_ORIGIN` (HTTPS) or the explicitly bound
loopback origin; caller Host headers cannot expand that allowlist.
An optional key tests that integration's actual rights without replacing your
Studio login. MCP discovery calls `tools/list`. The tester allows reads only;
write endpoints are visible, but updates use deliberate merchant actions or an
external API client. Binary assets and operator APIs are excluded from testing.

## Products → Description

The TipTap visual editor supports formatting, headings, quotes, lists, links,
images, video, code and undo/redo. **Markdown** edits the same structured JSON
content through a source buffer; **Apply Markdown** admits it to the product
draft. While the source is pending, saving the product, switching content
languages or leaving the section is guarded. Discard restores the last applied
source. Product save remains revision checked. Unsafe URLs and unsupported nodes
are rejected; raw HTML is never served as executable product content. Markdown
mode is unavailable for documents containing video, underline formatting or
explicit image dimensions to avoid dropping those features. Headings normalize
to H2/H3; editor-only null attributes are removed before API admission. Missing translations inherit the shop's main
language; edits create only the selected language's override.

## Products → Variants

Choose up to five named option groups with comma-separated values, then generate
up to **50 combinations per batch**. Existing combinations are identified across
cursor pages and marked as existing; generated SKU defaults avoid current SKUs.
Review selection, SKU, price and stock before creating. New variants start
inactive, use the saved parent's catalog/content defaults, and preserve missing
translations. Successful rows survive a partial failure; retry processes the
remaining rows. Creation is intentionally a sequence of native product
transactions, not one all-or-nothing family transaction. The server serializes
writes per shop and rejects duplicate combinations on create and edit, including
concurrent requests. Each child opens its full editor and can return to the parent;
its options are editable there. Families above 10,000 rows use the product API in
bounded batches rather than this UI's family lookup. Full Shopware inheritance
masks and native property-group entities remain upstream gaps.

## Sales channels

A dedicated workspace separates channels from Rule/Flow Builder. The main
storefront is a persisted, editable `default` channel. It inherits shop languages and
shared company/checkout settings, and cannot be deleted or deactivated. Other
channels expose dependency-checked deletion. See [automation lifecycle](automation.md#starting-configuration-and-lifecycle).
Create another storefront or headless channel in
three steps: translated name/type → enabled languages/navigation/catalog → review.
Choose products by search rather than entering IDs. All-catalog mode still
respects activation and per-product channel visibility. Preview links contain
shop and channel context; host domains still need operator DNS/hosting setup.

Each saved channel exposes **Inherited settings** for company identity, taxes,
shipping and payments. These embed the existing revision-aware configuration
editors at that channel's scope. Fields inherit until overridden; reset resumes
inheritance and later shared-basis changes. Stale basis/channel revisions are
rejected. Activation/deactivation is confirmed and preserves existing orders;
no destructive hard-delete shortcut exists. Entity history and restoration use
the same supported channel history API.

## Fresh shops and standard apps

A new independent shop has no externally connected apps. Its **Apps** workspace
opens discovery immediately and displays the bundled integrations (engraving,
PayPal, Shopware Payments, Storyfront, Google Analytics, Gmail, Slack and email).
Install opens the app's configuration. Availability is distinct from installation
and a working external connection; payment/mail credentials and authorizations
must be configured separately. Existing empty shops benefit without a seed-data
migration or automatic activation of paid/external services.

## Verification and boundaries

Frontend regressions cover Markdown/visual editing, source safety, bounded variant
review/retry/pagination, expiring scopes and confirmation, read testing, empty-shop
app discovery, channel onboarding and scoped settings. Real HTTP/PostgreSQL suites
cover duplicate and concurrent variants, denied foreign references, channel
visibility/overrides, integration-key containment/revocation and tenant isolation.
These tests and the bounded Lean policies do not establish full core correctness,
100% coverage or production payment certification.
