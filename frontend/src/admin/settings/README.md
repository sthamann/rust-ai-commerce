# admin/settings

Shared issuer/master data plus tax, country, shipping and payment settings under one workspace.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `useSettingsDraft.ts`: canonical record/revision, dirty draft, cancellation and save lifecycle. Locale changes keep unsaved edits.
- `SettingsSaveBar.tsx`: shared accessible busy, dirty, success and read-only feedback.
- `CommerceSettings.tsx`
- `MasterDataSettings.tsx`
- `SettingsWorkspace.tsx`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.

Layouts load independently of Customers. See [Studio interface](../../../../docs/studio-interface.md) for ownership, responsive behavior and verification.

## International modules

`CountriesSettings` and `CountryDefinition` configure delivery selection and tenant
region overlays. `TaxSettings`/`DestinationRuleEditor` edit classes and destination
conditions. `MethodSettings` shares translated method CRUD/country availability.
`LanguageSettings` owns enabled/main content locales; `TranslationJobs` starts,
polls, reviews and applies persistent catalogue jobs. `CommerceSettings` owns one
revisioned aggregate across all those panels. Shared pickers/inheritance live under
`shared/geography`; scoped catalogues must not leak between shops or staging.
The mandatory localization check and international component tests run in CI.
