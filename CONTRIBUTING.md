# Contributing to Vendune

This is an experimental commerce and migration laboratory. Changes should keep
merchant authority, tenant isolation and deterministic commerce operations explicit.

## Start locally

Follow [the quickstart](docs/quickstart.md). You can explore commerce without
Ollama or cloud API keys. Use synthetic shops and simulated payments for tests.

## Report a bug

Use the bug-report issue form. Include the commit/version, operating system,
setup path, exact steps and expected versus observed output. Remove private
credentials and customer data from logs. Security-sensitive findings should
follow [the security scope](docs/security.md), not a public issue containing secrets.

## Propose a change

Open an issue describing the user problem and the smallest useful change.
Good first contributions include setup documentation, locale corrections,
reproducible commerce bugs and small behavior ports. Do not advertise an
unimplemented protocol or production capability in documentation.

## Validate proportionally

For documentation/site changes:

```sh
python3 scripts/build_site.py
python3 scripts/check_site.py
```

For frontend changes, run `npm ci`, `npm run format:check` and `npm run build`
from `frontend/`. For Rust changes, use `cargo fmt --check`,
`cargo clippy --locked --all-targets -- -D warnings` and `cargo test --locked`.
Run the relevant application suites from [the feature tour](docs/features.md#verify)
against your own instance. Original Shopware ports require original-source
comparisons described in [the migration workflow](docs/migration.md).

## Formal contracts and source review

All Rust modules, schema/build inputs and proof tooling are recorded in
`proof/manifest.json`. A changed/new module requires a deliberate review record;
CI does not silently refresh it. For policy changes also update the generated
model, exact theorem, production binding and representative negative mutation.
Do not weaken a contract merely to make an incorrect change pass.

```sh
python3 scripts/formal.py --generate --record-review 'Explain the reviewed change and relevant regression evidence'
python3 scripts/formal/mutations.py
python3 scripts/formal.py
```

Read the [Lean guide](docs/formal-verification.md) for installation and the
precise boundary. Unproved modules remain unproved after hash review; only the
specified extracted policies have Lean proofs. Pull requests must pass the
required `verify` check, including the formal gate and real integration suites.

## Pull requests

Describe the concrete before/after behavior, relevant checks and remaining
limits. Keep unrelated changes out of the diff. Do not commit `.env`, provider
keys, session tokens, private data or dependency/build directories.

Contributions are made under the [Vendune Sustainable Use License](LICENSE).
Vendune is source available; own-business stores are permitted, while commercial
shop platforms, managed hosting and SaaS for independent merchants require
separate written permission. Preserve upstream licenses and copyright notices.
You retain ownership of your contribution; no copyright transfer or blanket
relicensing consent is implied. See [the licensing guide](docs/licensing.md).
