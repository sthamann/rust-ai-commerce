# Screenshots and recordings

The three `playground-*-en.jpg` screenshots were captured on 2026-10-03 from
the actual running prototype in a separate synthetic Commerce Playground shop:

- `playground-product-en.jpg`: the mug detail, gallery, SKU choices and price.
- `playground-flow-en.jpg`: the installed six-step saved-rule routing flow;
  standard/priority tags, a 15-second delay, invoice generation and stop.
- `playground-orders-en.jpg`: the actual €22.41 mug checkout after TRY10;
  immutable billing/shipping address, payment/delivery and available next action.

These are browser captures, without mocked responses, rearranged UI or image
editing. The interface is English; all identities and addresses shown are synthetic.
The other retained screenshots illustrate their named feature at capture time.
Older navigation can differ from the current Orders, Customers, Settings and Apps
workspaces. They are not asserted to be fresh captures of every current page.

The short feature recordings are real earlier synthetic-shop captures. Their
metadata and editing boundaries are recorded in [demos.json](demos.json). Pauses
removed from a clip do not establish a response-time measurement. Optional AI
proposal examples are separate from the provider-free playground flow.

Benchmark JSON files are evidence from the described isolated measurements, not
live-shop statistics. See [benchmarks.md](../benchmarks.md) for scope.

The `catalog-*-en.png` captures were recorded on 2026-10-05 in the same
synthetic Commerce Playground: server-filtered Products, the actual product
editor/WYSIWYG and translated category tree. The Studio Vase and Studio Objects
category were created and saved through the actual UI. No product data, server
responses or layout were mocked for these captures.

The `studio-settings-en.png` capture was recorded on 2026-10-05 from the running
synthetic Commerce Playground. It shows the current grouped shell, dedicated
settings navigation and native company form. The UI was captured directly,
without mocked responses, layout editing or image generation.

The `../screenshots/vendune-shipping.jpg` and `vendune-product-media.jpg` captures were recorded on 2026-10-05 from the current Vendune build in the synthetic Commerce Playground. They show the shared settings/content-language controls and the saved three-image mug gallery, without mocked responses or image editing. The gallery uses bundled demo illustrations; these are not generated product photographs or evidence of paid model quality. No live configuration was changed for these captures.

The `../screenshots/vendune-app-discovery.png` and `vendune-app-details.png`
captures were recorded on 2026-10-05 from the real running Vendune build in the
synthetic Commerce Playground, with English UI and no mocked data or image
editing. Cover illustrations are generated inline vectors, not official provider
logos or AI photographs. No app installation, live deactivation or provider call
was performed to capture them.

The `studio-editor-en.png`, `studio-api-en.png` and `studio-channels-en.jpg`
captures were recorded on 2026-10-06 from the running synthetic Commerce
Playground. They show applied Markdown in the visual editor, real MCP discovery
in the API explorer and native channel cards. Product and channel test drafts
were discarded; no existing product, channel or app was changed for these
captures. No layout edits, generated screenshots or mocked responses were used.
The displayed milliseconds measure one local test, not a performance benchmark.

The `platform-ai-en.png` and `platform-infrastructure-en.png` captures were
recorded on 6 October 2026 from the actual local control-plane build, English UI
and an isolated synthetic PostgreSQL shop. No response/layout mocking or model
request was used. Provider fields are real environment defaults, and the local
Ollama test endpoint is intentionally unreachable. “Configured” is not provider
health. macOS has no Linux cgroup counters, so CPU/RAM display —; the PostgreSQL
and Qdrant probes are actual local requests, not production benchmarks.

## Current illustrated feature tour

The two 8 October App Studio PNGs show the new native designer and an actual
product-bound private preview with a saved PostgreSQL record. Their exact source,
synthetic fixture and browser capture boundaries are in
[the feature-tour provenance](feature-tour/README.md).

The [6 October 2026 capture set](feature-tour/README.md) accompanies
[the complete current feature guide](../features.md). Its screenshots and twelve
GIFs come from real isolated Nord Atelier/empty lifecycle shops. Recording
provenance distinguishes unchanged UI captures at `036b36a` from the reviewed
`5e4f8b5` integration additions; no response or DOM mocking is used.

## Homepage showcase refresh

The [homepage showcase](showcase/README.md) adds six selectable, captioned H.264
workflow videos and expandable WebP captures. Fresh Nord Atelier storefront,
product and saved-checkout captures are from `84d4f1b`; five same-day feature
recordings retain their earlier source versions and editing boundaries.
[The manifest](showcase/manifest.json) records durations, dimensions and hashes.
