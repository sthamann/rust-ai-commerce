# shared/customer

Reusable customer/address forms; parents own persistence.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- `AddressBook.tsx`
- `AddressCard.tsx`
- `AddressFields.tsx`
- `CustomerFields.tsx`
- `customer-types.ts`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
