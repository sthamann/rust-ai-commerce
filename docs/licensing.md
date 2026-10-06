# Vendune licensing

Vendune is **source available** under the [Vendune Sustainable Use License 1.0](../LICENSE).
The license follows n8n's sustainable-use approach, with explicit commerce-specific
permissions and restrictions. It is a modified license, not n8n's unmodified SUL,
MIT, or an OSI-approved open-source license. The LICENSE text governs; this page
explains practical examples.

## What can I do?

| Use | Under this license |
| --- | --- |
| Run your company's own B2C or B2B store, including paid goods and downloads | Permitted |
| Run multiple brands or storefronts belonging to your company | Permitted |
| Let your own shoppers use accounts, checkout, APIs or shopping agents | Permitted |
| Adapt the core, develop apps, experiment locally, teach or research | Permitted within the license's use restrictions |
| Publish a free fork or contribution with the license and required notices | Permitted; recipients remain bound by the license |
| Charge for setup, customization or maintenance of a merchant's own installation | Permitted if it does not become a prohibited managed commerce offering |
| Rent ordinary infrastructure and self-host your company's own shops | Permitted |
| Sell a fork as a shop system, including a renamed or modified version | Requires a separate written commercial license |
| Offer unrelated merchants a hosted platform, managed shops or white-label SaaS | Requires a separate written commercial license |
| Sell an embedded commerce API or agent service for other merchants' shops | Requires a separate written commercial license |

The platform restriction applies to both single-tenant managed offerings and
shared-database SaaS. Bundling access with another paid service does not avoid it.
A sales channel, tenant ID, different brand name or rewritten interface does not
change the license. Feature access through HTTP, MCP or another agent protocol is
still use of the software.

## Why not AGPL or ordinary MIT?

MIT allows commercial use and redistribution. Copyleft licenses such as AGPL
can require sharing source under specified conditions, but do not prohibit a
commercial competitor from offering hosting. Vendune's chosen restriction is
on commercial platform use itself, so it is described as source available.

## The license change is prospective

The repository moved from MIT to these terms on **5 October 2026**. Copies and
versions already distributed under MIT retain their MIT permissions. This change
does not retrospectively withdraw them or prohibit an existing MIT fork from
using the code it already received. New Vendune changes distributed only under
the new license cannot simply be imported into that fork under MIT.

Third-party code, dependencies, model weights and geography datasets retain their
own terms. In particular, original Shopware MIT notices remain intact. See
[upstream attribution](../THIRD_PARTY.md) and bundled `fixtures/licenses/` notices.
The project does not claim exclusive rights in those components.
The self-hosted container includes `LICENSE`, `THIRD_PARTY.md` and bundled
geography notices under `/app/licenses/`; dependency terms still apply separately.

## Commercial permission

For a hosted, embedded or resale arrangement, start a non-confidential licensing
inquiry through [the maintainer's GitHub profile](https://github.com/sthamann).
Describe whether you will operate your own stores or provide commerce services
to independent merchants. A request is not permission; an exception requires a
written agreement from the applicable rights holders. Do not post credentials,
customer information or confidential commercial terms in public issues.

## Contributions

Contributions are submitted under [the repository license](../LICENSE), with
third-party terms and copyright ownership preserved. No transfer of copyright
or blanket permission to relicense someone else's contribution is implied.
See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Reference

- [n8n Sustainable Use License 1.0](https://github.com/n8n-io/n8n/blob/master/LICENSE.md)
- [MIT permissions](https://choosealicense.com/licenses/mit/)
- [AGPL-3.0 permissions and conditions](https://choosealicense.com/licenses/agpl-3.0/)
