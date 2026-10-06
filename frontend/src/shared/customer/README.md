# shared/customer

Reusable customer/address forms; parents own persistence.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`AddressBook.tsx`](AddressBook.tsx): Tenant-owned address cards, defaults and revision-aware CRUD shared by account and CRM.
- [`AddressCard.tsx`](AddressCard.tsx): Human-readable address used in order snapshots and address books.
- [`AddressFields.tsx`](AddressFields.tsx): Structured accessible address editor; no hidden JSON or storefront-only duplicate model.
- [`CustomerFields.tsx`](CustomerFields.tsx): Contact fields mirror the account API while access, identity and pricing remain separate.
- [`customer-types.ts`](customer-types.ts): Shared customer/address contracts; merchant and customer sessions use distinct request adapters.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
