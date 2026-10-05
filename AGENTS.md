# Changes to the commerce prototype

Prefer the codebase-memory MCP graph for structural code discovery. Keep Rust
modules small and give every source file a responsibility comment; the existing
structure check is mandatory.

## Production contracts and Lean

- `src/verified_kernel.rs` is production code extracted to Lean. Keep its syntax
  within the closed grammar accepted by `scripts/formal/extract.py`.
- Do not weaken a business property to make a proof pass. No sorry/admit, custom
  axioms or native_decide. Required proof names are listed in `proof/manifest.json`.
- New critical pure decisions need a production consumer, precise Lean property,
  comparison cases and a negative mutation. Surrounding SQL/async/provider code
  remains explicitly unproved unless a stronger actual extraction proves it.
- Review every changed Rust/schema/build/proof file and explain the behavior and
  relevant regression evidence before explicitly updating review hashes with
  `python3 scripts/formal.py --generate --record-review 'specific review reason'`.
  CI must never refresh hashes or generate artifacts to conceal drift.
- After changes run `python3 scripts/formal.py`,
  `python3 scripts/formal/mutations.py`, Rust format/lint/unit checks and the
  affected real HTTP/PostgreSQL suites. Do not claim entire-core certification,
  a fully verified translator or bug-free behavior from these partial proofs.
- Do not add credentials, private sessions/customer data or paid provider calls
  to proof/test fixtures. Use isolated shops and local provider fixtures.

The exact proof boundary and extension procedure are documented in
`docs/formal-verification.md`. Required GitHub verification checks must stay active.

## Internationalization contract (mandatory for every new module)

- Every customer/merchant-facing field (including shipping/payment names and descriptions,
  tax labels, country/region names, product names, SEO, rich descriptions and category content)
  must accept enabled shop content languages. Do not hard-code four product languages.
- Content editors must use `shared/i18n/ContentLanguage`, `ContentLanguagePicker` and
  `LocalizedField` (or `shared/geography/TranslationFields` for object maps). One
  selected content language applies to the entire editor, including nested flow
  nodes. Do not render separate text inputs/areas for every language. The localization
  gate rejects stacked language value fields; keep its negative controls passing.
- Use the shop's `mainLocale` as the per-field fallback. `null`/missing means inherit;
  an explicitly empty description must remain empty. Never save inherited values as
  fabricated translations or silently copy names into every language.
- All new interface text and bundled content ships in English, German and Spanish;
  preserve French where supported. Use typed shared vocabulary modules, never raw JSX
  text/labels. `npm run localization` is required in CI. The legacy literal inventory
  records existing debt; do not grow it to bypass this rule.
- Reuse `shared/geography` search/group pickers for country or region selection.
  Country checkbox walls and unvalidated free-text subdivision IDs are prohibited.
- Newly enabled delivery countries require explicit tax configuration and valid shipping
  and consumer payment coverage. Do not invent tax law or automatically set new countries
  to a zero tax rate. Destination conditions run through the existing native Rule Builder.
- Translation/model output is untrusted. Preserve URLs, IDs, units, media and document
  structure; validate content, tenant permissions and expected revisions on apply.
  Bulk operations must persist progress and process bounded batches. Test inheritance,
  a non-English main language, tenant isolation, stale versions and provider failures.

## Tenant isolation contract

- Treat unrelated merchants as separate tenants; sales channels within a tenant
  are shared commerce contexts, not independent tenant security boundaries.
- Derive identity/membership in authentication middleware. Never trust caller
  principal/tenant fields, model output or app arguments as authorization.
- Scope object reads/writes/deletes by tenant and ID, plus customer ownership
  where applicable. MCP, jobs and extension entry points use the same checks.
- Relations between tenant tables need composite tenant-aware foreign keys.
  New ID-only references must have a scoped counterpart; the schema guard in
  `scripts/security/tenant_schema.py` rejects missing containment.
- Add real own/foreign-shop regressions for new object entry points. Confirm
  denied mutations leave victim state unchanged; UUIDs are not authorization.
- Run the registered `tenant_isolation` suite. Do not describe foreign keys,
  app-only RLS or selected Lean policies as complete core/SaaS isolation.
