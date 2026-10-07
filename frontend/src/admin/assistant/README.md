# admin/assistant

Merchant conversation rendering, reviewed change proposals and model connection settings.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

`WorkspaceCopilot.tsx` presents the same scoped conversation beside the current workspace, including staging and selected entity references. Opening help or selecting a question starter does not call a model; merchant submission and approval remain explicit.

## Modules

- [`MessageText.tsx`](MessageText.tsx): MessageText keeps merchant interaction separate from workspace orchestration.
- [`ProposalCard.tsx`](ProposalCard.tsx): ProposalCard keeps merchant interaction separate from workspace orchestration.
- [`SettingsDialog.tsx`](SettingsDialog.tsx): SettingsDialog keeps merchant interaction separate from workspace orchestration.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
