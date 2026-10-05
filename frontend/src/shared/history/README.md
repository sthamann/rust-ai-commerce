# Entity history

`EntityHistory` loads summaries on disclosure, then exact snapshots on selection.
All restores require an explicit confirmation, a current revision and the owning
editor's reload callback. Dirty drafts disable restoration. Historical rich text
is rendered as text; it is never evaluated. `history-model` bounds structural
comparisons. This folder has no admin/storefront dependencies.
