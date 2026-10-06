# admin/settings

Shared issuer/master data plus tax, country, shipping and payment settings under one workspace.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- [`CommerceSettings.tsx`](CommerceSettings.tsx): One revisioned international settings aggregate: drafts survive navigation between countries, taxes, methods and languages.
- [`CompanyField.tsx`](CompanyField.tsx): One factual field with visible channel inheritance, an explicit reset and searchable geographic selection.
- [`CompanyLogo.tsx`](CompanyLogo.tsx): Private logo preview and bounded upload; attaching/removing is a draft change until the profile is saved.
- [`CompanyTranslations.tsx`](CompanyTranslations.tsx): Brand and legal text use one content-language selector and independent language/channel inheritance.
- [`CountriesSettings.tsx`](CountriesSettings.tsx): Delivery-country selection and editable catalogue definitions, including tenant-owned subdivisions.
- [`CountryDefinition.tsx`](CountryDefinition.tsx): Country metadata and subdivision editing with multilingual names; custom definitions cannot invent ISO assignment.
- [`CustomerGroupsSettings.tsx`](CustomerGroupsSettings.tsx): Customer groups share the translation/inheritance editor and revisioned settings aggregate.
- [`DestinationRuleEditor.tsx`](DestinationRuleEditor.tsx): Geographical tax rule editor: country, subdivisions, postcode constraints, date window and persisted Rule Builder condition.
- [`LanguageSettings.tsx`](LanguageSettings.tsx): Shop main language and enabled locales with resumable provider-backed bulk product translation drafts.
- [`MasterDataSettings.tsx`](MasterDataSettings.tsx): Structured company profile with single-language content, inherited channel scopes, logo drafts and revision-bound saves.
- [`MethodRemoval.tsx`](MethodRemoval.tsx): Dependency preflight is advisory; aggregate save repeats it under the checkout configuration lock.
- [`MethodSettings.tsx`](MethodSettings.tsx): Master/detail shipping and payment configuration, translated content and searchable country availability.
- [`SettingsSaveBar.tsx`](SettingsSaveBar.tsx): Consistent settings save feedback, dirty state and permission-aware controls.
- [`SettingsWorkspace.tsx`](SettingsWorkspace.tsx): Independent settings workspace: grouped navigation, explicit dirty-draft guards and native API forms.
- [`TaxSettings.tsx`](TaxSettings.tsx): Editable tax classes and explicit fallback/country rates with destination rules using native Rule Builder references.
- [`TranslationJobs.tsx`](TranslationJobs.tsx): Start catalogue translations, poll durable progress, review paginated drafts and apply bounded revision-checked batches.
- [`company-types.ts`](company-types.ts): Typed company metadata and sparse per-channel inheritance contract; statutory facts are never auto-translated.
- [`useCompanyContext.ts`](useCompanyContext.ts): Load enabled content languages, countries and channel choices without overwriting an edited draft on locale refresh.
- [`useSettingsDraft.ts`](useSettingsDraft.ts): Revisioned settings drafts survive locale refreshes, reject late loads and keep failed saves editable.

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

The structured company editor uses `CompanyField`, `CompanyLogo`, `CompanyTranslations`, `company-types` and `useCompanyContext`. Scope changes have a dirty-draft guard; factual fields show/reset basis inheritance. Translated texts use the shared content language, including channel-main-language fallback. See [company settings](../../../../docs/company-settings.md).

`CustomerGroupsSettings.tsx` owns revisioned translated group names, pricing basis, dependency-aware removal and shared history. Group definitions use one selected content language.
