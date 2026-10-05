# admin/styles

Studio visual system and merchant operational layouts. Entry imports preserve cascade order.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `commerce-manager.css`
- `operations.css`
- `studio.css`: existing Studio layout baseline.
- `workspace-polish.css`: shared theme, density, grouped scrollable navigation and page hierarchy.
- `forms.css`: root-loaded native form primitives; never dependent on visiting a lazy workspace.
- `settings.css`: settings-owned navigation, grouped forms and sticky save bar.
- `app-catalog.css`: app-owned category and package cards.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
