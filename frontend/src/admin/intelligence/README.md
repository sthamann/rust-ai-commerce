# admin/intelligence

Evidence, graph and learning read models; curated relationships and observed behavior remain distinguishable.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `KnowledgeOverview.tsx`: whole-shop census, explanation and useful next actions
- `KnowledgeSources.tsx`, `SourceEditor.tsx`: cursor library, inherited editor and guarded lifecycle
- `ExternalKnowledge.tsx`: active merchant-private app evidence and provenance
- `KnowledgeExplorer.tsx`, `KnowledgeFacts.tsx`: product-centred relationships and authoritative facts
- `KnowledgePreview.tsx`: no-model retrieval and explicit customer/merchant scope
- `knowledge-types.ts`: typed read models and source-kind contract
- `KnowledgeView.tsx`
- `MemoryView.tsx`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
