# Feature-tour captures — 6 October 2026

[Feature guide](../../features.md) · [All media provenance](../README.md)

These are screenshots and recordings of the actual Vendune application, captured
through its browser UI in an isolated local Docker installation with real
PostgreSQL and Qdrant. The shop, merchant/customer identities, addresses, order,
knowledge source and app records are synthetic. No production shop or customer
data is used. Responses and DOM/layout were not mocked or rearranged; screenshots
were not generated or retouched.

## Source versions

The feature guide was reviewed against `main` at **`5e4f8b5`**. The unchanged UI
screenshots and all twelve GIFs were captured from **`036b36a`** (the current
Nord Atelier demo, including the preceding platform controls). The instance was
then rebuilt from `5e4f8b5` to check the trusted identity/hosted frontend additions.
`identity-explorer.jpg`, `app-data-models.jpg` and `app-design-still.jpg` were
captured from that rebuild. They show the latest identity route and the actual
saved app model/design. This distinction avoids relabeling older captures as a
different source build.

The twelve checked-in fashion photographs are generated demo artwork. The
screenshots show those actual bundled files; they do not establish image-provider
quality or a new inference call. The two separately dated email/Product Lab
illustrations referenced by the feature guide retain their original provenance
in the parent media directory.

## Recording inventory

| File | Real interaction | Observed boundary |
| --- | --- | --- |
| [variants-cart.gif](variants-cart.gif) | Switch coat size, inspect SKU/stock and add to cart | The cart contains the selected child product |
| [checkout.gif](checkout.gif) | Select delivery, review quote and place order | Simulated authorization/order only; no real charge |
| [product-languages.gif](product-languages.gif) | Change saved content language and open Markdown | Hydrates existing translations; no automatic model translation |
| [variant-generator.gif](variant-generator.gif) | Generate XL/XXL draft combinations | Stops at review; the children are not created |
| [history-restore.gif](history-restore.gif) | Confirm restore of a previous product revision | Native validated restore; live stock is preserved |
| [knowledge-publication.gif](knowledge-publication.gif) | Request publication and confirm the decision | The fictional source becomes eligible public knowledge |
| [flow-canvas.gif](flow-canvas.gif) | Navigate and inspect the saved six-step flow | Editor interaction; no external delivery is asserted |
| [channel-wizard.gif](channel-wizard.gif) | Select languages/category root and review a channel | Final creation is a separate step |
| [app-design.gif](app-design.gif) | Add Text/Cards, undo and redo | Native canvas with explicitly labeled sample data |
| [app-preview.gif](app-preview.gif) | Save a product-bound care record in the working preview | Actual sandbox-managed persistence |
| [selective-release.gif](selective-release.gif) | Release the selected app package | Separate app-record data remains in the sandbox |
| [shop-lifecycle.gif](shop-lifecycle.gif) | Pause, trash and restore an empty shop | Recoverable lifecycle of the isolated `lifecycle-tour` shop |

The GIFs use actual browser screencast JPEG frames, encoded at 1,024 pixels wide
with an eight-frame-per-second presentation and a 128-color palette. Long waits
are shortened and important states are held for readability; recording segments
of the same operation are joined where needed. No interaction or successful
result is synthesized. Their timing must not be used as a latency benchmark.
[recordings.json](recordings.json) records the source segment names, captured
frame counts, final byte sizes and SHA-256 digests.

## Service and verification scope

All checkout payments are simulated. The optional model, email, Slack, OAuth,
PayPal and private Storyfront services were not contacted for these captures.
Provider settings illustrate configuration; “Configured” is not a health check
or evidence of a successful external transaction. The knowledge test uses native
source retrieval without an LLM call. Platform counters/probes describe the
isolated instance rather than production capacity.

The guide combines observed UI behavior with the reviewed native contracts.
Screenshots do not establish every configuration, external integration or failure
case. Keep that distinction, source versions and synthetic-data boundary when
replacing media after a feature change.
