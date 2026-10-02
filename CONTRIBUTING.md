# Contributing to Rust AI Commerce

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

## Pull requests

Describe the concrete before/after behavior, relevant checks and remaining
limits. Keep unrelated changes out of the diff. Do not commit `.env`, provider
keys, session tokens, private data or dependency/build directories.

Contributions are made under the repository's [MIT license](LICENSE).
