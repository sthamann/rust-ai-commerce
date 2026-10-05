# Vendune Studio interface

The 2026-10-05 repair fixes the actual first-entry settings failure: layout rules
were in the lazy Customers stylesheet. Settings and the app catalog now import
their own styles, while native field primitives load with the Studio shell.
A direct visit works without first opening Customers.

## Ownership

- `admin/shell/StudioSidebar.tsx` owns permission-filtered groups and independently
  scrollable navigation. Company settings appear once in this navigation.
- `admin/styles/workspace-polish.css` owns common spacing, typography, blue/neutral
  theme tokens and shell breakpoints. `forms.css` owns native form grids.
- `admin/settings/SettingsWorkspace.tsx` owns secondary navigation and the local
  discard confirmation. `MasterDataSettings.tsx` groups the ten issuer fields.
  `CommerceSettings.tsx` retains the existing native tax/country/method APIs.
- `admin/settings/useSettingsDraft.ts` owns load/save/error/canonical revision and
  unsaved state. Transport changes caused by switching language preserve the draft.
- `admin/settings/SettingsSaveBar.tsx` renders state, progress and read-only access.
- `shared/i18n/studio-ui-i18n.ts` contains the four-language navigation and settings
  vocabulary; countries use the existing translated customer dictionary.
- `admin/styles/app-catalog.css` is imported directly by AppsManager, without a
  dependency on loading the customer module.

## Storage repair

`src/operations/receipts.rs` updates the central issuer record with its expected
revision. The old INSERT source admitted only revision zero, preventing updates
to existing records. The matching-revision source and conflict update fence now
allow normal edits while rejecting stale and competing writes. Issued documents
retain their immutable issuer snapshots. The HTTP regression in
`scripts/merchant_operations.py` covers creation, sequential edits, stale edits,
simultaneous writes, tenant isolation and previously issued documents.

## Verification and boundaries

The new eight component tests cover complete issuer payloads, successive revisions,
explicit discard, retained drafts on conflict/language changes, read-only access
and the four translated country views. Build/type checks and architecture checks
cover module ownership. Browser checks exercise fresh settings/app entry, actual
save/reload, desktop/tablet/mobile widths and both themes. Screenshots show the real
synthetic Commerce Playground; see [capture provenance](assets/README.md).

The shared shell improvement applies across workspaces. This does not claim every
existing module has been redesigned or that the full application has 100% coverage.
The discard guard covers settings-area navigation and browser unload; it does not
intercept every possible Studio navigation. Formal checks cover the documented
bounded policies and reviewed adapter hashes, not all SQL or all UI behavior.

## International settings (2026-10-05)

Countries, taxes, shipping/payment methods and content languages share a revisioned
draft across secondary navigation. `shared/geography` owns keyboard/search/group
selection and field inheritance; tax/method panels use a record list with a
dedicated detail editor. The country catalogue and US subdivisions feed the same
controls in account addresses and checkout. Languages include durable translation
progress/review/apply. [International commerce](international-commerce.md) records
the native API/MCP contract and remaining tax/language limits.

## Channel settings and media workspaces (2026-10-05)

See [the settings/media guide](settings-media.md) for the current single-language editor, field-level checkout overrides, dependency-safe method removal, gallery and optional private image jobs. These are native prototype extensions; they do not establish additional full Shopware API/DAL parity, current tax law, paid-provider quality or whole-system formal certification.

## App management (2026-10-05)

The installed/discover library adds searchable category cards with real versions
and activation status. App details separate configuration, registered interfaces,
data and versions. Asset failures preserve generated covers/icons; all new labels
and bundled summaries support English, German, French and Spanish. See the
[app library guide](app-library.md) for the actual contract and verification.
