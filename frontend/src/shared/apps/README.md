# shared/apps

Manifest-defined slots, page surfaces and opaque iframe bridge; credentials stay in the host.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`AppFrame.tsx`](AppFrame.tsx): Opaque-origin app UI. Its SDK can invoke only this app's declared, server-authorized actions.
- [`AppSlot.tsx`](AppSlot.tsx): Generic registered product configuration slot. App packages own labels, input names and business rules.
- [`AppSurfaces.tsx`](AppSurfaces.tsx): One registry read per workspace; app bundles load only when their surface is mounted.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
