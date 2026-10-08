# App isolation and operator setup

This guide records the enforced boundaries of the current app platform. Read it
before adding runtimes, stores or credentials. [Architecture](app-platform.md) and
[Studio](app-studio.md) describe the same production owners.

## Audit fixes

| Finding | Current owner and protection | Regression |
|---|---|---|
| B1 table bomb | `sandbox_engine.rs`, `sandbox.rs`, `component_runtime.rs`: preflight, element/memory limits, pooling, fuel, epochs | Rust oversized private table/growth/host-loop tests; `app_components` |
| B2 shared app DDL | `apps/manifest.rs`, `apps/storage.rs`, migration 058: tenant/app hashed tables, RLS, own-version compatibility | `apps`, `app_schema`, `tenant_isolation` |
| B3 service ID impersonation | `apps/approval.rs`: exact Rust-canonical approved digest; reserved names include Payments | `apps`, `app_surfaces`, `payment_providers` |
| B4 wrong webhook tenant | `webhook_scope.rs`, auth middleware: route tenant admission, reject conflicting header | `app_secrets` strict non-owner RLS |
| B5 global slow event lane | `events.rs`: eight lanes, bounded batches, lease fences, retry and replay | `app_events`, `services`, `rust_connectors` |
| B6 event disclosure | `event_contract.rs`, `event_projection.rs`: family/own scopes plus minimized payloads | `app_events`, Rust projection tests |
| B7 client-only surface ACL | `surface_grants.rs`: actor/package/context/action-bound five-minute grant | `apps`, `app_surfaces`, `app_assets` |
| B8 input/storage/drafts | `input_schema.rs`, `storage.rs`, `developer/drafts.rs`: recursive bounds, database quotas, actor-private CAS autosave | `apps`, `app_preview`, frontend safety tests |

## Operator service configuration

Use the server's serializer rather than an independent JSON hashing implementation:

```sh
cargo run --bin vendune -- --app-digest extensions/apps/service-example/manifest.json
python3 scripts/build_app_ui.py service-example --output .run/service-example.html
```

The UI builder embeds the SDK into one self-contained HTML bundle and emits its
SHA-256. Store that bundle on the configured service. Configure the **reviewed**
manifest digest and exact UI path/digest server-side:

```json
{
  "service_example": {
    "url": "https://apps.example.test",
    "uiUrl": "https://apps.example.test",
    "token": "SERVER_SECRET_INJECTED_BY_OPERATOR",
    "approvedDigests": ["RUST_CANONICAL_PACKAGE_SHA256"],
    "uiDigests": {"index.html": "SELF_CONTAINED_HTML_SHA256"}
  }
}
```

`APP_SERVICES` is operator-owned. A merchant cannot replace its URL or become that
service by choosing its app ID. Exact bundled and frozen historical manifests remain
approved for compatibility; altered content requires an explicit pin. Private origins
need exact `APP_SERVICE_PRIVATE_ORIGINS` approval. Ordinary public egress uses HTTPS, blocks
private/reserved addresses and mixed DNS answers, pins DNS and rejects redirects.
Ambient proxy variables are ignored. A trusted private origin intentionally grants
private-network access; it must never be merchant-controlled.

Register Ed25519 public keys in `APP_PUBLISHERS` as
`{"publisher":{"key_id":"BASE64_PUBLIC_KEY"}}`. Only signatures using registered
keys can occupy `publisher_app`. `vendune --sign-app MANIFEST.json` consumes a base64
32-byte seed from stdin and returns the signed manifest and public key. Private
seeds do not belong in app packages, environment JSON, logs or Git. A publisher
signature does not automatically authorize an operator service or a changed UI bundle.

## Credentials and surfaces

Per-shop/app service, incoming webhook and outgoing signature secrets reuse platform
AES-GCM encryption. Authenticated associated data binds tenant, app, kind, digest and
revision. Rotation uses a current personal team-manager identity, explicit approval
and optimistic revision; GET returns metadata only. Once configured, an invalid or
stale tenant secret fails closed rather than falling back to a global token. Existing
operator bootstrap secrets remain usable only where no tenant secret was configured.

App callback credentials store only hashes, never raw tokens. Keys bind creator,
tenant, app, package, scopes and expiry. Current membership is checked on every call;
revocation, permission loss or package changes remove authority. Original app capabilities are stored separately from their mapped core rights: `products.read` cannot imply `assets.read`, and `jobs.read` cannot imply `jobs.write`. Migration 070 leaves legacy app keys without callback capabilities; rotate them with explicit consent before use. Core callbacks
project personal data only with separate `customers.pii` consent. Surface grants are
short-lived browser capabilities with an even narrower action/context boundary.

Pinned iframe HTML is limited to 1 MiB, UTF-8 and expected content type. The host
sets an opaque script-only sandbox with restrictive CSP and communicates through
source/nonce-checked SDK messages. Direct fetch and form submission are blocked.
This is not a proof of zero exfiltration from hostile browser code: self-navigation
and browser behavior remain a trust boundary. Review sensitive permissions and UI
publishers, or prefer host-native views. No popup permission is implemented by default.

## Limits and failure behavior

- Wasm: 1 MiB linear memory, 10,000 table elements, bounded stack, four core instances
  per component, 64 pooled runtime instances/memories/tables per process. Typed hooks
  use 100,000 fuel, five 10 ms epochs and 128 read-only host calls.
- Compile: four admitted blocking compiles/process, 32 fixed deduplication stripes,
  128-entry digest-checked LRU cache, 32 KiB source. Five-second response deadline.
  A timeout cannot cancel the already-running compiler thread; its admission permit
  stays held until it exits. This is a bounded compiler gate, not OS process isolation.
- Service calls: eight slots/tenant-app and 64/process, five-second request deadline,
  64 KiB bounded JSON input/output; excess gets 429. Slots are not globally distributed.
- App storage: database trigger enforces 100,000 rows and 64 MiB/tenant-app, including
  relation writes and rollback. Files use existing product asset quotas; file callback
  is explicitly requested and uploads are limited to 8 MiB. Inline previews ≤256 KiB.
- Input: depth twelve, 2,048 nodes, 1,000 array entries and bounded strings/properties;
  closed supplied schemas support nested object/array/number validation.
- Preview: ten actor-private environments, one-hour access, twenty apps; no live
  service/provider effects. Expiry denies access; storage cleanup is an operator concern.
- Jobs: fenced 60-second claims with explicit bounded lifetime, cancellation ACK and
  uncertain status after lease loss. Retrying requires review of external effects.

A validation failure rolls back the relevant transaction. SQL quotas also cover
concurrent writers, unlike client-only checks. External sends remain at least once;
no local transaction proves an external effect occurred only once.

## Migration and deployment

Run normal numbered schema migrations with the dedicated provisioner. Migration 058
copies historical shared-table records into each owning tenant/app table, updates
relations and retains old tables. Deploy the updated runtime role grants before
non-owner workers; forced RLS needs the existing request/worker tenant context.
Snapshot PostgreSQL before the cutover and review retained tables afterward.
Migrations 059–070 add delivery fences, quota accounting, grants, drafts, activity,
callback keys, encrypted secrets, private previews, multi-relations, recovery and jobs.
Migration 070 stores the exact approved app capabilities separately from team
rights. Historical callback keys have no implicit grants and must be renewed.

Update independent service receivers for complete batches and new precise event
permissions. Rebuild/pin custom UIs. Existing services without new tenant secrets
can keep operator bootstrap tokens, but must pin custom package digests. Existing
callback keys and configured tenant secrets need explicit review after package changes.
Check private Payments/Storyfront deployment separately; public declaration changes
do not deploy their private implementation.

Lean proves selected extracted admission decisions. SQL/RLS correctness, encryption
integration, Wasmtime, compiler limits, browsers and remote services rely on concrete
regressions and trusted infrastructure. No complete-core certification, universal
extension compatibility or production-scale guarantee is claimed.
