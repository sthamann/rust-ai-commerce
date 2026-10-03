# shared/apps

Manifest-defined slots, page surfaces and opaque iframe bridge; credentials stay in the host.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- `AppFrame.tsx`
- `AppSlot.tsx`
- `AppSurfaces.tsx`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
