# admin/orders

Order directory, detail, state-machine transitions, payment/delivery operations and document generation. Components use shared API commands; state effects come from server events.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `OrderDetail.tsx`
- `OrderPaymentDelivery.tsx`
- `OrderWorkflow.tsx`
- `OrdersManager.tsx`
- `ReceiptPanel.tsx`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
