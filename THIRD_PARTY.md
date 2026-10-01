# Upstream attribution

The quantity calculation behavior in `src/pricing.rs` is a partial behavioral
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

`reference/price.php` instantiates the original installed upstream classes;
the repository does not vendor Shopware, a commercial B2B package, or a model.
PHP rounding behavior was checked against the official PHP 8.5 runtime and
https://github.com/php/php-src/blob/PHP-8.5/ext/standard/math.c . No PHP C
source is bundled. The reference assumes default PHP `precision=14` and the
PHP 8.4+ decimal rounding behavior. Other runtime settings require a new gate.

All catalog products, accounts and vector illustrations are synthetic demo
content authored for this prototype. No merchant/customer data is included.
Rust/npm dependencies retain their respective licenses. Model weights and
their licenses must be obtained separately through the chosen model provider.
