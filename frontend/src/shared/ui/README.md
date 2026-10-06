# shared/ui

Presentational icons and product artwork.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`Brand.tsx`](Brand.tsx): Shared Vendune identity; product branding is independent of tenant-owned company logos and session keys.
- [`ConfirmDialog.tsx`](ConfirmDialog.tsx): Shared modal confirmation with focus containment, Escape, focus restoration and an explicit destructive action.
- [`Icon.tsx`](Icon.tsx): Icon: Presentational icons and catalogue artwork with explicit inputs..
- [`ProductArt.tsx`](ProductArt.tsx): Product Art: Presentational icons and catalogue artwork with explicit inputs..
- [`WorkspaceBoundary.tsx`](WorkspaceBoundary.tsx): Contain a workspace render failure and let the user retry without losing the application shell.
- [`brand.css`](brand.css): Shared vector brand sizing and typography for Studio and the operator console.
- [`confirm-dialog.css`](confirm-dialog.css): Modal surface shared by settings, media and future destructive actions.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.

`Brand.tsx` owns the fixed Vendune name and canonical repository/mark; `brand.css` sizes the shared identity. Merchant company logos remain tenant configuration.
