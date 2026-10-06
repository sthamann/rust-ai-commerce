# shared/i18n/locales

Four-language dictionary data with exact-key verification.

Each file starts with its responsibility. See [the source inventory](../../../../../docs/module-inventory.md) for the full map.

## Modules

- [`de.ts`](de.ts): Merchant interface strings: de.
- [`en.ts`](en.ts): Merchant interface strings: en.
- [`es.ts`](es.ts): Merchant interface strings: es.
- [`fr.ts`](fr.ts): Merchant interface strings: fr.
- [`shop-de.ts`](shop-de.ts): Storefront and operational interface strings: de.
- [`shop-en.ts`](shop-en.ts): Storefront and operational interface strings: en.
- [`shop-es.ts`](shop-es.ts): Storefront and operational interface strings: es.
- [`shop-fr.ts`](shop-fr.ts): Storefront and operational interface strings: fr.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../../docs/testing.md); file presence does not mean full test coverage.
