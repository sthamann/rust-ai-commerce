# shared/i18n

Four-language locale context, dictionaries and localized errors.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- `app-i18n.ts`
- `connected-i18n.ts`
- `customer-i18n.ts`
- `email-i18n.ts`
- `errors-i18n.ts`
- `i18n.tsx`
- `operations-i18n.ts`
- `platform-i18n.ts`
- `shop-i18n.ts`
- `workbench-i18n.ts`

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
