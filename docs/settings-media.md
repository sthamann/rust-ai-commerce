# Settings scopes, safe removal and product media

## Open the current Studio

A tab kept open across an update can retain the previous JavaScript bundle. Reload it.
The current shell is branded **Vendune** and settings show a **Settings scope** selector
plus **Content language**. The legacy tab title `Atelier · Rust AI Commerce` and
stacked EN/DE/FR/ES inputs identify an older loaded interface. The explicit
`?shop=<id>&studio=commerce#merchant` link opens the same current merchant workspace.

## One content language, across the editor

Select an enabled content language once above the settings form. Shipping/payment
names and descriptions, tax labels and nested country fields follow it. Rules and
Flow Builder already use the same shared components. Missing/null text inherits
the shop's main language. An explicit empty description stays blank. Viewing or
switching languages never creates stored translations. New interface vocabulary
ships in EN/DE/ES/FR and the localization gate prohibits new stacked language fields.

## Shared basis and sales-channel settings

The tenant is the shop/security boundary. Sales channels belong to that tenant and
share products, customers and inventory. They can have separate catalogs, navigation,
languages, domains and headless/storefront modes through the existing channel contract.
Independent merchants still use different tenants and memberships.

Company identities, structured legal/contact fields and logos already have field-level
channel inheritance. The international checkout aggregate now also supports sparse
channel overrides: delivery countries, shipping/payment methods and their translated
content, tax rates, destination rules and tax labels. Select **All sales channels ·
shared basis** or a specific channel. Unchanged values continue to follow future basis
changes. Restore inheritance for the current section, then save. Dirty scope switches
are blocked until the changes are saved/discarded. Language, country/subdivision and
product tax-class definitions belong to the shared basis; channel editors change
availability, rates/content and rules rather than inventing incompatible class IDs.

Patches identify methods/classes by stable IDs rather than array positions. Explicit
null and removal differ from inheritance. HTTP saves require both channel `revision`
and `baseRevision`. Checkout options, product prices, carts and the final locked order
resolve the channel's settings. Saved orders retain their original snapshot. Sandbox
cloning includes the patches; each `settings-channel:<id>` can be released separately.

## Taxes and method administration

The tax editor foregrounds **Destination rules and exceptions** before country fallback
rates. Each rule combines country, validated state, postcode/list/prefix/range, date
window, priority and a saved Rule Builder condition. The original deterministic tax
resolver owns the actual price. See [international commerce](international-commerce.md)
for precedence, geography sources and the compound-tax/tax-law limitations.

Shipping and payment panels have a method list, add, detail, activation and remove.
Removal opens one shared keyboard-accessible confirmation. A tenant-scoped preflight
shows references from orders, open carts, channel overrides and rules/flows. Used
methods offer deactivation instead. The API repeats its guard under the same settings
lock used by checkout, including selective releases, so skipping the dialog cannot
remove a referenced method. Unused entries are removed on aggregate save. References
are conservative: any exact ID value in rule/flow JSON blocks removal. This is a native
protection policy, not a claim of complete Shopware DAL dependency equivalence.

Tax classes/rules and gallery removal use the same modal. Product-assigned tax classes
are protected by the native aggregate API; the tax modal does not display a dependency
count. Removing an image detaches the gallery entry; it does not erase immutable asset
bytes or historical attachments. Deletion dialogs never imply that old orders change.

## Product media

**Products → product → Media** is an ordered thumbnail gallery with a selected large
preview, cover selection, left/right reordering, single-language inherited alt text,
URL entry and drag/drop or multi-file upload. PNG/JPEG/WebP uploads are bounded to
8 MiB each, 20 gallery entries and the existing 50-assets-per-product limit. Uploads
use the normal tenant-owned immutable asset endpoints; save the product to persist
its gallery. Successfully uploaded files are retained if a later file fails.

The assistant context preview consumes the product's actual first gallery image.
An empty gallery shows a clear empty state. ProductArt is no longer used to fabricate
an illustration for the selected product in that panel.

### Optional image provider

On the Rust server set `IMAGE_GENERATION_ENABLED=true`, `OPENAI_API_KEY` and optionally
`OPENAI_IMAGE_MODEL` (default `gpt-image-2.5-sunburst`). `OPENAI_BASE_URL` is an
operator-controlled endpoint for compatible providers/local fixtures, not user input.
The local installation does not enable this feature automatically.

A merchant supplies instructions and explicitly requests generation or optimization
of an uploaded image belonging to that product. These are real Images generation/
multipart-edit requests; configured cloud requests may incur charges. Optimization
never fetches an arbitrary merchant-supplied remote URL. Jobs persist in PostgreSQL,
have tenant/product admission limits and run in a separate media worker; use
`PROCESS_ROLE=media-worker` for a dedicated replica, or `all` locally. Pending jobs
are claimed with `SKIP LOCKED`; ambiguous/interrupted calls are failed and never
silently retried. The editor restores pending/ready drafts after reopening.

Provider output is bounded, decoded as an actual image with allocation/dimension
limits, re-encoded as PNG and stored privately. Review the image, explicitly add it
to the gallery, then save the product. Apply requires the original product revision;
a newer edit rejects a stale image draft. No claim of factual image accuracy follows
from this validation: merchant review remains necessary. Save outstanding product edits before creating/applying an image draft. The provider fixture proves
protocol, bytes, tenant/revision/private-public behavior and restart, not model quality
or a real paid OpenAI run.

## API / agent contract

| Operation | HTTP | Native MCP |
|---|---|---|
| Channel configuration | GET/PUT `/api/merchant/commerce/channels/{id}` | `merchant.commerce.read/save` with `channelId` |
| Method references | GET `/api/merchant/commerce/methods/{shipping\|payments}/{id}/dependencies` | `merchant.commerce.dependencies` with `area`, `methodId` |
| Provider availability | GET `/api/merchant/media/provider` | `merchant.media.provider` |
| Create image draft | POST `/api/merchant/products/{id}/media/jobs` | `merchant.media.create` |
| Restore pending/reviewable drafts | GET `/api/merchant/products/{id}/media/jobs` | `merchant.media.list` |
| Inspect image draft | GET `/api/merchant/media/jobs/{id}` | `merchant.media.detail` |
| Publish reviewed asset | POST `/api/merchant/media/jobs/{id}/apply` | `merchant.media.apply` |

Settings require `settings.read/write`; media requires `catalog.read/write`. All
endpoints use the existing tenant and personal/API authorization. Tools invoke the
same handlers; no bypass implementation exists.

## Source ownership and regression evidence

- `commerce/settings_patch.rs`: sparse transport differences, ID alignment, explicit nulls.
- `commerce/settings_scope.rs`: scoped reads/writes and basis serialization.
- `commerce/settings_release.rs`: clone/snapshot/selective publication validation.
- `commerce/method_usage.rs`: dependency reads and authoritative delete guards.
- `assets/image_jobs.rs` / `image_provider.rs`: durable private review state / bounded provider wire adapter.
- `admin/settings/CommerceSettings.tsx` / `MethodRemoval.tsx`: scope and single content-language workspace / preflight.
- `admin/catalog/{ProductMediaWorkspace,MediaDropzone,AiImageStudio}.tsx`: gallery / uploads / reviewed image jobs.
- `shared/ui/ConfirmDialog.tsx`: one focus-contained modal; `workspace-i18n.ts`: complete UI vocabulary.
- Migrations 031/032: channel patches / durable image jobs; no commercial database dependency.

`settings_scopes.py` exercises real channel prices, immutable orders, method references,
explicit media fallback, selective publication and MCP/tenant denial. `image_jobs.py`
uses a local Images fixture for generation/edit bytes, private preview, stale apply,
provider errors and cold restart. Existing `international_commerce`, `company_settings`,
`staging` and `catalog_management` suites protect the connected domain paths. Component
regressions cover modal focus/Escape, gallery edits/drops and scope/language behavior.
These SQL/storage/provider/UI adapters are reviewed and regression-tested; they remain
outside the extracted Lean business-policy proof boundary.
