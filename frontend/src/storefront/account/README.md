# storefront/account

Customer login, profile, addresses and own-order history.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`CustomerAccount.tsx`](CustomerAccount.tsx): Shopper account overlay uses its own scoped session; merchant credentials never authenticate a customer.
- [`CustomerSignIn.tsx`](CustomerSignIn.tsx): CustomerSignIn: focused form view with explicit typed inputs and callbacks.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.

Account login passes the tenant storage name as `sessionKey`, because React reserves
`key` for reconciliation. `customer-account.test.tsx` exercises actual account
composition for login and registration: the session must reach the protected
profile/address/order requests before data is rendered. HTTP lifecycle and account
isolation are additionally covered by `scripts/customer_accounts.py`.
