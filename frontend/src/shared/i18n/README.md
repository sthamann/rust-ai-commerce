# shared/i18n

Four-language locale context, dictionaries and localized errors.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`ContentLanguage.tsx`](ContentLanguage.tsx): One content-language selection per editor, distinct from interface language; no writes on selection or fallback.
- [`ContentLanguagePicker.tsx`](ContentLanguagePicker.tsx): Compact shared language switcher with explicit main-language context; selection never changes persisted content.
- [`LocalizedField.tsx`](LocalizedField.tsx): Single visible field for the editor's language, with main-language preview and explicit restore-to-inheritance.
- [`app-assistant-i18n.ts`](app-assistant-i18n.ts): App assistants and extension permissions use the same EN/DE/FR/ES vocabulary.
- [`app-i18n.ts`](app-i18n.ts): App and evidence UI vocabulary, shared by store, merchant and payment components.
- [`app-library-i18n.ts`](app-library-i18n.ts): App library vocabulary and built-in summaries; no inferred connection or payment readiness.
- [`app-studio-i18n.ts`](app-studio-i18n.ts): App Studio and native runtime vocabulary; every key ships EN/DE/FR/ES.
- [`automation-fields.ts`](automation-fields.ts): Localized labels for original rule and native flow parameter fields.
- [`automation-i18n.ts`](automation-i18n.ts): Four-language automation editor vocabulary keeps source identifiers stable and user labels readable.
- [`automation-labels.ts`](automation-labels.ts): Source-named rule labels are localized independently from their stable integration identifiers.
- [`checkout-i18n.ts`](checkout-i18n.ts): Checkout vocabulary: the same purchase and payment states in every supported UI language.
- [`company-i18n.ts`](company-i18n.ts): Company identity, field inheritance and legal storefront vocabulary in four interface languages.
- [`connected-i18n.ts`](connected-i18n.ts): Four-language vocabulary for connected apps, consent and visual automation.
- [`content-language.ts`](content-language.ts): Resolve editable translation keys without merging distinct regional locales or fabricating inherited values.
- [`graph-navigation-i18n.ts`](graph-navigation-i18n.ts): EN/DE/FR/ES labels for saved current-public-fact category predicates; query phrases use enabled content languages.
- [`crm-i18n.ts`](crm-i18n.ts): Complete CRM/history vocabulary shared by settings, customer account and entity editors.
- [`customer-i18n.ts`](customer-i18n.ts): Account and address labels share four complete locales across storefront and studio.
- [`email-i18n.ts`](email-i18n.ts): Complete mail workspace vocabulary in English, German, French and Spanish.
- [`errors-i18n.ts`](errors-i18n.ts): Localized request guidance across all transports; original diagnostics remain available to developer tools.
- [`i18n.tsx`](i18n.tsx): i18n: Four-language locale context, UI dictionaries and translated API errors.
- [`international-i18n.ts`](international-i18n.ts): International settings vocabulary. Every key requires English, German, French and Spanish.
- [`knowledge-i18n.ts`](knowledge-i18n.ts): Knowledge workspace vocabulary: sources, evidence and capabilities without fabricated learning claims.
- [`operations-i18n.ts`](operations-i18n.ts): Operational commerce labels in all supported languages.
- [`platform-i18n.ts`](platform-i18n.ts): Operator console translations. Every visible control has an explicit translation in all supported locales.
- [`shop-i18n.ts`](shop-i18n.ts): Shared shop text hook; dictionaries live in focused locale files.
- [`studio-ui-i18n.ts`](studio-ui-i18n.ts): Studio navigation and settings guidance in all four supported interface languages.
- [`workbench-i18n.ts`](workbench-i18n.ts): Complete four-language vocabulary for environments, developer tools and knowledge ingestion.
- [`workspace-i18n.ts`](workspace-i18n.ts): Settings scopes, dependency confirmation and media workspace vocabulary in every supported interface language.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.

## Shared content editing

`ContentLanguage` carries enabled shop languages, the shop main language and the
current content language. It is separate from `LocaleProvider` (interface labels).
`ContentLanguagePicker` presents one compact selector; `LocalizedField` displays
one input/textarea and explicit main-language inheritance. Selecting a language
never copies or persists text. `content-language.ts` preserves regional keys;
legacy base-language keys are editable only when unambiguous.

Products, SEO, attachments, rule/flow/campaign/channel names and flow-node
instructions reuse these primitives. Country/region/method/tax/category maps
use `TranslationFields`, an object-map adapter of the same controls. Email
provider templates reuse the same language selector; their existing provider
built-in template defaults remain a separate fallback contract.

`tests/unit/unified-translations.test.tsx` covers actual graph-node edits,
restoring inheritance, explicit empty text, dynamic Italian, regional isolation
and single-language attachment submissions. `localization-gate.test.ts` supplies
a negative control for stacked translation fields.

## Translator workflow

See [the translation guide](../../../../docs/localization.md). `npm run translations -- export <file.json>` exports existing typed keys; `import` validates the complete document before changing string literals. `npm run localization` rejects untranslated rendered prose, incomplete catalogues and mismatched parameters, without a legacy exemption.
