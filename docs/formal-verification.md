# Lean-checked commerce contracts

The prototype now runs Lean 4.29.1 proofs for **22 policies used in production
Rust paths**. Forty-six theorems cover the properties below. This is **not a
certificate that the entire commerce core is correct or bug-free**. The current
inventory contains 205 Rust modules: one extracted policy module, seventeen reviewed
binding modules, one comparison driver and 186 unproved modules. Binding review
is not a proof of those seventeen modules.

## Connection to the real application

```text
HTTP / MCP / storefront
        ↓
Production Rust operations → src/verified_kernel.rs
                                      ↓ closed typed extraction
                              Commerce/Generated.lean
                                      ↓
                               Claims.lean → Lean kernel
                                      ↓
                            compiled-environment recheck
                                      ↓
                                transitive axiom audit
```

The application calls the Rust functions directly. There is no separate
handwritten Lean implementation of their behavior. `scripts/formal/extract.py`
accepts only `bool`/`u64` arguments/results, literals, comparisons, Boolean
operators, `min` and `saturating_sub`. It rejects unsupported syntax instead of
silently approximating it. Lean `Nat` subtraction saturates at zero, matching
`u64::saturating_sub`; this subset cannot overflow through addition/multiplication
because those operators are excluded. Claims quantify over all natural inputs,
including all representable `u64` values.

**The extractor is a trusted, tested translator, not a verified Rust compiler.**
Correct production input conversion and surrounding state handling remain part
of the reviewed boundary. Finite conformance checks strengthen that connection;
they do not prove the translator correct for every program.

## Exactly what is proved

| Production policy | Lean guarantee | Actual consumer |
|---|---|---|
| `discount_cap` | Discount is bounded by both requested amount and goods total; remainder plus discount conserves the total | `src/discount.rs` |
| `stock_admissible` | Admitted quantities are positive, within stock and conserve stock under subtraction | `src/order_checkout.rs` |
| `refund_admissible` | Prior/reserved plus requested refund cannot exceed captured amount; zero refunds fail | `src/payments/operations.rs` |
| `revision_admissible` | Admission requires an exact positive revision | `src/commerce/fulfillment.rs` |
| `replay_admissible` | A replay belongs to the same cart; an open cart requires the same fingerprint | `src/order_checkout.rs` |
| `scope_admissible` | Admission requires authentication and a known scope; explicit denial cannot inherit role defaults | `src/auth/permissions.rs` |
| `order_edit_admissible` | Terminal orders cannot admit operational edits | `src/commerce/order_workflow.rs` |
| `completion_admissible` | Completion requires payment ready, deliveries complete and a nonterminal order | `src/commerce/order_workflow.rs` |
| `cancellation_admissible` | Cancellation requires open deliveries and no external payment/refund constraint | `src/commerce/order_workflow.rs` |
| `manual_payment_admissible` | Manual payment cannot confirm an external provider; it requires a pending payment and nonterminal order | `src/commerce/fulfillment.rs` |
| `download_admissible` | Blocked orders grant no download; admitted downloads require payment or explicit simulated authorization | `src/assets/download.rs` |
| `checkout_contact_admissible` | Financial checkout requires email and billing data; simulated checkout has an explicit exception | `src/order_checkout.rs` |
| `receipt_admissible` | Accepted provider receipts match amount and currency and confirm the outcome | `src/payments/receipt_guard.rs` |
| `platform_admissible` | Operator access requires a personal identity, active grant and account | `src/platform/auth.rs` |
| `app_read_admissible` | Read aliases admit declared read-only, non-mutating handlers | `src/apps/surfaces.rs` |
| `rule_authenticated` | A guest cannot satisfy the authenticated-customer condition; both Boolean branches match exactly | `src/marketing/rule_match.rs` |
| `rule_boolean_comparison` | Equality, inequality and emptiness select the exact Boolean result | `src/rule_comparison.rs` |
| `app_flow_admissible` | Only explicitly eligible private mutation actions can be flow targets | `src/marketing/app_flows.rs` |

Every policy also has an exact acceptance theorem. This proves that valid
inputs are accepted as well as unsafe inputs rejected; replacing a policy with
`false` (or a discount cap with zero) fails. These are contracts on supplied
facts, not proofs that database/network adapters obtain those facts correctly.

The [proof statements](../proof/Commerce/Claims.lean) and
[source inventory](../proof/manifest.json) are the precise scope. For example,
the discount cap theorem does **not** prove the complete tax/rounding/distribution
algorithm, and stock admission does **not** prove transaction isolation.
Authentication is supplied by the middleware; the theorem does not prove that
middleware or the older aggregate `read` permission path. Provider receipt
identity/signature checks and their parsers remain outside the pure theorem.

## Verification that runs on every push and pull request

The existing **Verify prototype / verify** job now also:

1. Checks generated artifacts match the production Rust policy source exactly.
2. Requires every Rust module to be classified and checks full-file review hashes.
   Schema migrations, Cargo files, proof claims, extraction/audit scripts and the
   verification workflow also require an explicit recorded review after changes.
3. Builds proofs with the pinned Lean toolchain and rechecks compiled declarations
   using bundled `leanchecker`.
4. Audits all 46 required theorems' transitive axioms. Only Lean's standard
   `propext`, `Quot.sound` and `Classical.choice` foundations are allowed. `sorry`,
   `admit`, custom axioms, `native_decide` and missing theorem audits fail.
5. Executes compiled Rust and Lean functions on **4,168** identical inputs:
   exhaustive Boolean assignments plus numeric boundaries/random cases, including
   `u64::MAX`. Their output types and values must match.
6. Requires Lean to reject **49** deliberately broken policy variants. Also
   rejects 14 unsupported grammar examples, three stale/unclassified/disconnected
   inventory cases and nine proof-shortcut/axiom/missing-audit examples.
7. Runs existing Rust, PHP-reference and real PostgreSQL HTTP regressions.

CI never regenerates the policy model or refreshes review hashes automatically.
It uploads `formal-verification-<commit>` JSON evidence, including explicit
`entireCoreProved: false`. A green check represents these checks on that commit,
not a whole-system certificate. Required branch checks prevent ordinary merges
before verification succeeds; changing the checks or their contracts remains a
review responsibility.

## Local verification and intentional changes

Requirements: existing Rust/Python toolchains plus [elan](https://github.com/leanprover/elan).
The pinned version is in `proof/lean-toolchain`; no Mathlib dependency is needed.
Install the Lean toolchain once, then run from the repository root:

```sh
elan toolchain install leanprover/lean4:v4.29.1
python3 scripts/formal.py
python3 scripts/formal/mutations.py
```

When deliberately changing a policy, update its contract and actual consumer,
review the generated diff and run the relevant HTTP regression. New pure
critical decisions should enter this subset or use a documented stronger
extraction approach; do not mark async/SQL/provider code as proved.

```sh
python3 scripts/formal.py --generate --record-review 'Explain the reviewed behavior, affected contracts and regression evidence'
python3 scripts/formal/mutations.py
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
```

`--record-review` records changed file hashes; **it cannot turn unproved code
into proved code**. Review the manifest diff. Do not refresh hashes to suppress a
failure whose cause you have not investigated. Proof changes must not weaken an
existing business guarantee merely to accept a broken implementation.

## What remains open for the entire core

Database concurrency/isolation, tenant ownership in SQL, allocations and
rounding, full configurable workflows and flows, network/provider behavior,
extension execution, frontend code, operating system dependencies and AI model
outputs are unproved. They keep their existing behavioral tests and review locks.
The terminal-state integration already closed a real gap: direct HTTP payment
and delivery edits now fail for completed orders and app-defined terminal states;
regressions verify the persisted revision remains unchanged.

The next meaningful expansion is extracting complete integer money/tax and
reservation state-transition modules, specifying their overflow bounds and
proving the actual update operations. For a larger safe Rust subset,
[Aeneas](https://github.com/AeneasVerif/aeneas) is a possible next extraction layer;
its Rust coverage and concurrency limits must be assessed against the real code.
It is not installed or used by this proof pipeline. Full-system correctness
requires substantially more specification and proof work, and depends on what
properties have actually been specified.

For Lean's trust model and axiom limitations, see the primary documentation:
[proof validation](https://lean-lang.org/doc/reference/latest/ValidatingProofs/)
and [axioms](https://lean-lang.org/doc/reference/latest/Axioms/).

## Connected-app rule contracts

Three additional extracted policies have production consumers: `rule_authenticated`
uses actual authenticated customer presence, `app_flow_admissible` admits only explicitly eligible private mutation actions, and `rule_boolean_comparison` selects
supported equality/inequality/empty semantics. Five Lean properties state exact
behavior and reject granting the logged-in branch to a guest. The original string,
Unicode conversion, wildcard matching, UUID comparison input construction and the
surrounding rule AST evaluation remain reviewed/tested Rust, not fully proved modules.
Provider OAuth, encrypted storage, Gmail/GA4 imports, Slack delivery and private graph
projection remain unproved integration code with real local HTTP/database regression
coverage. No whole-core or bug-free certification is claimed.

The platform operator grant is also production-bound: personal credential, current
grant and active status must all hold. The surrounding session lookup, SQL, offline
bootstrap and provisioning are reviewed/tested adapters, not Lean-proved database
or deployment correctness.

The app GET policy proves admission from declared metadata; it does not prove an external service is actually side-effect-free. See [the full app boundary](app-platform.md).

The automation increment additionally extracts exact XOR hit-count admission and the thirty-day durable delay bound. Three new properties and negative mutations protect those production decisions. The rule interpreter, calendar parsing and SQL/async flow runtime remain unproved; [automation](automation.md) defines their actual test and migration boundaries.

## Destination tax guard and translation apply (2026-10-05)

The production `destination_tax_admissible` function requires all five condition,
country, state, postcode and date guards. Its exact Lean theorem accepts precisely
that conjunction; all 32 Boolean assignments are compared and each individual
guard bypass is rejected as a mutation. The native tax resolver consumes it.
This proves the combined Boolean admission, not fact extraction, tax priority,
rounding, current tax law or correctness of database configuration. Translation
apply consumes the existing exact `revision_admissible` policy; stale product
edits conflict. SQL row locks and provider output validation remain reviewed,
unproved adapters with real PostgreSQL regression tests.

Channel settings, method dependency guards and image drafts (2026-10-05) add reviewed JSON/SQL/provider/MCP adapters around the existing validated checkout and revision policies. Sparse transport patching and deletion reference queries are not new extracted Lean decision policies. Provider output decoding, publication transactions, queue processing and UI behavior remain unproved; real isolated regressions and the exact source-review inventory document their scope. See [settings/media](settings-media.md).

## Connected CRM and history (2026-10-05)

`customer_group_net` is extracted from production and consumed by
`commerce/customer_groups.rs`. Its exactness property admits net presentation
iff a group exists and explicitly selects the business basis; an unknown group
cannot self-claim business presentation. Both Boolean input guards have negative
mutations and exhaustive compiled Rust/Lean comparisons.

Entity snapshot triggers, actor attribution, restoration transactions, group
dependency queries and frontend controls are reviewed **unproved adapters**.
Their real HTTP/PostgreSQL and component regressions are documented in
[entity history](entity-history.md). This does not certify whole-core correctness.
