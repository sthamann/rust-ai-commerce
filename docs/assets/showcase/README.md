# Vendune homepage showcase — capture provenance

[Open the showcase](https://sthamann.github.io/vendune/index.html#demo) · [Complete feature guide](../../features.md) · [Earlier capture provenance](../feature-tour/README.md)

The 6 October collection contains six selectable workflows and six expandable
screenshots. The homepage now also includes the two integration screenshots from
8 October described below.
These are recordings of the actual application, with synthetic shops, accounts,
addresses and records. The DOM, responses and interface were not mocked or
rearranged. Screenshots are unretouched browser captures (some transcoded to WebP).
The bundled fashion photographs are generated demo artwork, not newly generated
screenshots or evidence of a live image-provider call.

## Fresh storefront and checkout

`storefront.webp`, `product-detail.webp`, `checkout-complete.webp` and
`checkout.mp4` show the local application built from **84d4f1bc45811f3ac0b1e8646f44b147b9771dec**.
A separate `showcase-20261006` shop was created through the registration interface,
with the default twelve-product Nord Atelier catalog. Company identity was saved
through Studio. The checkout selected the native `coat-l` SKU, entered fictional
contact/address details, chose standard delivery, reviewed the server quote and
saved order **RAC-4869d1a5**. Shipping is free at this order value. The confirmation
shows simulated authorization; no real provider was contacted or money charged.

The raw browser videos were `checkout-sku.webm` and `checkout-order.webm`.
The final video joins seconds 154–166 of the first recording to the complete
15.84-second second recording, in capture order. The long idle inspection pause
is removed. Speed is unchanged; no interaction or successful result is synthesized.
The long form entry between recordings is omitted. The final clip is 27.83 seconds.
Raw browser output and session information are intentionally not published.

## Reused current feature recordings

The other five MP4s are H.264 transcodes of the actual same-day feature-tour GIFs.
Their source build is **036b36a**; the feature guide was reviewed at **5e4f8b5**.
They retain the source presentation timing: waits were shortened and important
states held. These recordings are not relabelled as captures of the later build.
See the [original inventory](../feature-tour/README.md) for exact scope and editing.

| Workflow | Source | What the recording demonstrates |
| --- | --- | --- |
| [App Studio](app-studio.mp4) | `app-design.gif` | Add components, inspect properties, undo and redo. Preview data is explicitly labelled sample data. |
| [Shop Knowledge](knowledge.mp4) | `knowledge-publication.gif` | Review and confirm publication of a fictional care source; native workflow, no training or inference claim. |
| [Flow Builder](flows.mp4) | `flow-canvas.gif` | Inspect the saved six-step flow and branches; this is an editor walkthrough, not proof of external delivery. |
| [Staging & Release](release.mp4) | `selective-release.gif` | Release the selected package while separate app-record data stays in staging. |
| [Multilingual Catalog](translations.mp4) | `product-languages.gif` | Hydrate saved product translations and inspect Markdown; no automatic AI translation call. |

`app-studio-gallery.webp` is a WebP transcode of `app-design-still.jpg` (5e4f8b5).
`flows-gallery.webp` and `knowledge-gallery.webp` are frames from their respective
source GIFs. Other posters are frames from the corresponding real recordings.

## Presentation and verification

All six clips have native playback controls, English WebVTT captions, download
links and links to the feature guide. Nothing autoplays. Chapter tabs support
arrow keys, Home and End; changing chapters pauses the preceding clip. The
screenshot viewer supports Escape and returns focus to the invoking link.
Without JavaScript, all clips remain accessible with native controls and image
links open the original files. Reduced-motion preferences disable decorative
transitions. Responsive layouts preserve the full recorded interface instead
of cropping away controls.

[manifest.json](manifest.json) records source versions, dimensions, durations,
byte sizes and SHA-256 digests. The site checker verifies the media inventory,
caption timing, local assets and chapter relationships. Browser checks cover
actual decoding, chapter navigation, pause behavior, image viewer and mobile
layouts. Presentation timing must not be interpreted as a performance benchmark.

No paid model, email, OAuth, PayPal, Slack or private Storyfront service was
contacted for this refresh. These captures demonstrate the described local paths;
they do not certify every provider integration or production capacity.

## Public integration captures 8 October 2026

These three unretouched PNGs were captured through Chrome from the publicly deployed
Core at **706102f8ff3526a6f5bba7ab09b96ce713d1de74**. They show the owned fictional
Retro Commodore demo shop, not a synthetic local deployment. Only the interface
language was changed to English and restored; no app, channel, catalog or customer
data was changed for these captures. No customer records, credentials or private
Storyfront source are published. No paid model call, email or payment was initiated.

| File | Observed screen | Scope |
| --- | --- | --- |
| [storyfront-installed.png](storyfront-installed.png) | Apps: one installed/enabled Storyfront package | Actual persisted installation, not a Discover-only card |
| [storyfront-managed.png](storyfront-managed.png) | Managed app detail with domain/channel and editor link | Same owned frontend registry as Storyfronts |
| [channel-domains.png](channel-domains.png) | Main channel Domains & experiences | Actual binding, reassignment/disconnect controls and existing editor |

The linked editor was opened separately and displayed the retained React Experience
Studio and published revision. These captures do not claim that the original native
Astro renderer is active publicly, that every displayed action was executed, or that
external providers passed acceptance. [Release review](../../current-release.md).

## Original public Storyfront captures — 9 October 2026

`native-public-studio-20261009.png` is the original Cobalt Studio after actual model-generated demo catalog/images, review, Build and Go live. `native-public-ai-scene-20261009.png` is a real German question answered by original Storyfront on the owned Luma shop; `native-public-mobile-20261009.png` captures the same scene at 390px. Original presentation runs in the private service. No private source, provider credential or access ticket is included. The images do not establish payment settlement, all native UI translations or production scale.

The 9 October checkout capture `native-public-checkout-20261009.png` records the
actual original Luma Bag handing two Totes to the shared Core checkout. Core
`b995b5a` saved simulated order RAC-4aed0976 / 54.70 EUR. Contact and address are
explicit fictional test data; no real payment or customer data is published.
The return-navigation repair is a later source change and is not implied by this
receipt capture. The homepage adds the actual original Studio, AI scene and mobile
captures to the existing gallery without relabelling earlier recordings.
