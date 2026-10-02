# Changes to the commerce prototype

Prefer the codebase-memory MCP graph for structural code discovery. Keep Rust
modules small and give every source file a responsibility comment; the existing
structure check is mandatory.

## Production contracts and Lean

- `src/verified_kernel.rs` is production code extracted to Lean. Keep its syntax
  within the closed grammar accepted by `scripts/formal/extract.py`.
- Do not weaken a business property to make a proof pass. No sorry/admit, custom
  axioms or native_decide. Required proof names are listed in `proof/manifest.json`.
- New critical pure decisions need a production consumer, precise Lean property,
  comparison cases and a negative mutation. Surrounding SQL/async/provider code
  remains explicitly unproved unless a stronger actual extraction proves it.
- Review every changed Rust/schema/build/proof file and explain the behavior and
  relevant regression evidence before explicitly updating review hashes with
  `python3 scripts/formal.py --generate --record-review 'specific review reason'`.
  CI must never refresh hashes or generate artifacts to conceal drift.
- After changes run `python3 scripts/formal.py`,
  `python3 scripts/formal/mutations.py`, Rust format/lint/unit checks and the
  affected real HTTP/PostgreSQL suites. Do not claim entire-core certification,
  a fully verified translator or bug-free behavior from these partial proofs.
- Do not add credentials, private sessions/customer data or paid provider calls
  to proof/test fixtures. Use isolated shops and local provider fixtures.

The exact proof boundary and extension procedure are documented in
`docs/formal-verification.md`. Required GitHub verification checks must stay active.
