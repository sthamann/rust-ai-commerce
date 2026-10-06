# admin/team

Personal accounts, memberships, roles, invitations and scoped developer access.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- [`AccessManager.tsx`](AccessManager.tsx): Fine-grained team overrides, revocable invitations and personal session inventory.
- [`PersonalAccountForm.tsx`](PersonalAccountForm.tsx): PersonalAccountForm: focused account-form view with explicit typed inputs and callbacks.
- [`UsersManager.tsx`](UsersManager.tsx): Users Manager: Personal accounts, memberships, roles, invitations and scoped developer access..

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
