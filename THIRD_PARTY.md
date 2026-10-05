# Upstream attribution

The quantity calculation and proportional delivery-tax allocation behavior in
`src/pricing.rs`, context/tier/quantity selection behavior in `src/context.rs`,
and numeric epsilon/null comparison semantics in `src/rule_comparison.rs`,
are partial behavioral
port of Shopware Core 6.7.14.2, reference commit
`de074a584d77d8abb09ddb21d8799f083a61a3da`.

Original source: https://github.com/shopware/shopware/tree/v6.7.14.2/src/Core
Copyright (c) 2019 shopware AG. MIT License.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

`reference/price.php`, `reference/context.php`, `reference/delivery.php`, and `reference/rules.php`
instantiate the original installed upstream classes;
the repository does not vendor Shopware, a commercial B2B package, or a model.
PHP rounding behavior was checked against the official PHP 8.5 runtime and
https://github.com/php/php-src/blob/PHP-8.5/ext/standard/math.c . No PHP C
source is bundled. The reference assumes default PHP `precision=14` and the
PHP 8.4+ decimal rounding behavior. Other runtime settings require a new gate.

All catalog products, accounts and vector illustrations are synthetic demo
content authored for this prototype. No merchant/customer data is included.
Rust/npm dependencies retain their respective licenses. Model weights and
their licenses must be obtained separately through the chosen model provider.

## Open database stack

- PostgreSQL: PostgreSQL License, https://www.postgresql.org/about/licence/
- Apache AGE: Apache License 2.0, https://github.com/apache/age/blob/PG17/LICENSE
- pgvector: PostgreSQL License, https://github.com/pgvector/pgvector/blob/v0.8.6/LICENSE

The Dockerfile builds AGE at commit `502f2c1fa32a04497dc286237186e58ac4956a53`
and pgvector at tag `v0.8.6`. No BSL/SSPL database or proprietary edition is
required. Model-provider APIs remain optional external services.

## Document parser

`pdf-extract` 0.12.1 (MIT) extracts searchable PDF text. `libc` (MIT OR Apache-2.0)
provides CPU limits and Linux address-space limits for its child process.
Dependencies remain external registry packages and retain their bundled license files.
No OCR, parser microVM, or arbitrary customer-code execution is implied.

## Bundled geography

`fixtures/geography.json` derives country codes/continents and localized names
from countries-list 3.4.1 and i18n-iso-countries 7.14.0 (MIT). Their copyright and
license notices are preserved in [countries-list.txt](fixtures/licenses/countries-list.txt)
and [i18n-iso-countries.txt](fixtures/licenses/i18n-iso-countries.txt). US subdivision
codes use the [US Census state reference](https://www2.census.gov/geo/docs/reference/state.txt).
Dataset versions, the explicit non-ISO XK entry and limits are documented in
[international-commerce.md](docs/international-commerce.md#sources-licensing-and-verification).
