# Current release — 9 October 2026

[Feature tour](features.md) · [Architecture](production-architecture.md) · [Complete documentation](documentation-site.md)

The connected intelligence and app release is merged in Core
`598bbec112165fcac1847797786e2ba5c606e06f`. The private Experience adapter pins
that Core and original Storyfront `2087783606e5c925317bae57625256a82c16bff0`;
its release is `f970543124d669971330945f74b87e9c799a76e4`.
[Complete changes, repeatable acceptance and remaining work](release-acceptance-2026-10-09.md).

The static API catalogue contains **279 HTTP method/path pairs**; installed app
routes are discovered separately. The source inventory contains **414 Rust
modules**. The formal subset has **45 extracted policies and 97 properties**,
with **142,298 compiled comparisons and no mismatch**. SQL, network and UI behavior
remain outside those proofs. [Formal evidence](formal-verification.md).

## Connected intelligence release

Merged [PR #73](https://github.com/sthamann/vendune/pull/73),
[PR #74](https://github.com/sthamann/vendune/pull/74) and
[PR #75](https://github.com/sthamann/vendune/pull/75) connect automatic bounded
indexing/model rebuilds, lexical/dense retrieval with optional reranking,
authorized read-agent rounds, reviewed source claims, signed public facts,
price guardrails/daily autonomy budgets, controlled layout experiments,
consent-bound cart preferences and native app ontology projections.
The source checks pass **187 Rust unit tests and 388 frontend tests**;
whole-source CI line coverage is **90.55% Rust / 63.23% frontend**.
[Architecture, configuration, evidence and incomplete audit items](cognitive-commerce.md).

Product answers and buyer advice recheck their admitted native product/source
inputs after inference; concurrent source, consent or commerce changes return
localized retry guidance. API, MCP, categories and opt-in document-event flows
reuse current native rights and storage. This does not make arbitrary generated
prose true, train model weights or complete every audit item.

Completed CI and public documentation are source evidence. The 8 October hosted
observations below remain dated observations of that earlier runtime: this
refresh does not confirm the new Core/private image active on Northflank, original
native workers enabled, external payment settlement or production capacity.

## Core hardening update

The eighteen-point core review is addressed in [the hardening guide](core-hardening.md): typed trusted identity and explicit route rights, strict deployment roles, consolidated current grants, shared tenant/connection leases, transaction-local SQL/PgBouncer, bounded off-thread Wasm/image work, commit wakes, isolated outbox retries and retention. The guide distinguishes source/tests from a verified public rollout.

## What changed and where to use it

| Capability | Merchant workflow | Implementation / evidence |
| --- | --- | --- |
| Storyfront installed with Experience | Apps → Storyfront; Storyfronts; channel Domains & experiences | Mount and package installation commit together; migration 055 repairs older mounts. [PR #67](https://github.com/sthamann/vendune/pull/67), [ownership](channel-management.md#storyfront-app-ownership-for-experience-shops) |
| Editable channels and frontend connections | Sales channels → Manage channel → Basics / Domains & experiences | Rename, translate, assign/disconnect addresses, pause/resume or switch public/private; personal previews remain read-only. [PR #65](https://github.com/sthamann/vendune/pull/65), [admission](channel-management.md) |
| Guest buyers visible to merchants | Customers → guest buyer → linked orders and checkout addresses | Derived contact from immutable order snapshots, not a newly authenticated account. Entering an email cannot claim another person's orders. [PR #66](https://github.com/sthamann/vendune/pull/66), [customer ownership](merchant-operations.md) |
| Personal merchant enrollment | Welcome-access link → choose/confirm password → normal Studio session | Scanner-safe access page; canonical account checks, session revocation and one-use handoff. [PR #63](https://github.com/sthamann/vendune/pull/63), [identity contract](experience-integration.md#merchant-password-enrollment-and-email-link-recovery) |
| Existing experiences discovered | Storyfronts → Edit experience / Open shop | Tenant-bound mount registry, safe operator editor template, no generated duplicate. [PR #64](https://github.com/sthamann/vendune/pull/64), [discovery](experience-integration.md#discover-and-edit-existing-experiences) |

The main `default` storefront cannot be deleted or changed to headless; it **can** be
paused or made private. Additional channel deletion checks current orders, customers,
carts, overrides and frontend references under transaction/revision protection.
A configured subdomain is distinct from provisioning DNS/TLS for an arbitrary
external customer domain.

## One connection, several views

![Experience ownership, atomic installation and existing editor path](assets/experience-connections.svg)

Core owns catalogue, price, stock, authentication and checkout. The private Experience
service owns presentation and its current/native editor selection. The public
Storyfront manifest links them; it contains no closed renderer or provider keys.

![Managed Storyfront connection and its existing editor](assets/showcase/storyfront-managed.png)

![Actual domain and channel management](assets/showcase/channel-domains.png)

## What was observed, and what remains separate

- **Publicly observed:** the owned Retro Commodore demo shop shows one installed and
  enabled Storyfront app, its existing domain and main channel. Its Edit experience
  link opens the retained **React Experience Studio** with its published revision
  and preview. The Core and private Experience releases were healthy.
- **Tested in isolated CI:** persisted app ownership/backfill and channel admission;
  private native Docker builds the original Astro Studio/Cinematic applications and
  checks original pages, brand persistence and anonymous/foreign-owner refusal.
- **Not inferred from those tests:** public native-renderer activation, every native
  media import, native worker model inheritance, complete original UI localization,
  Google/Apple OAuth acceptance, real payment settlement or production capacity.
- **No external transaction for this documentation refresh:** no new email, paid
  inference, image generation or payment; the new screenshots are passive English
  captures of an owned public demo. [Exact media provenance](assets/showcase/README.md#public-integration-captures-8-october-2026).

The retained 6 October fashion demo recordings are dated evidence of those local
workflows, not relabelled captures of this later release. For full scope, use
[Shopware parity](shopware-parity.md), [measured tests](testing.md),
[formal boundaries](formal-verification.md), [payments](payment-provider-api.md),
[currencies](currencies.md) and [production architecture](production-architecture.md).
