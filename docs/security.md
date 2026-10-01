# Prototype trust boundaries

- Localhost-only bind by default. Compose exposes PostgreSQL only on localhost.
- Random local merchant/database secrets are ignored by Git, never compiled
  into the frontend and never shown by verification scripts.
- Merchant operations require a bearer credential. Product read-only storefront
  data is public. Customer cart contexts are random bearer capabilities, bound
  to tenant and rotated on demo business login.
- Demo passwords use Argon2; accounts are synthetic and pre-seeded. This is not
  a customer registration, recovery, OAuth or SaaS merchant membership system.
- PostgreSQL parameterized queries, transaction locks, stock constraints and
  optimistic revision checks protect core mutation paths.
- Model output can only describe allowlisted typed changes. It cannot execute
  code/SQL, grant authority or approve its own proposal. Merchant approval is
  still necessary even when the model explanation sounds convincing.
- MCP rejects unrecognized browser Origin headers. API tokens are sent through
  explicit request headers. Full production CSRF/origin/CORS and OAuth policy
  need to be implemented consistently across all adapters.
- Public local inference endpoints currently have no per-user quotas; do not
  expose this development deployment to the Internet. Input/body limits alone
  do not protect against model resource exhaustion.
- Wasm gets fuel/memory/stack limits and no imports; WAT source is limited.
  Process-level compiler isolation remains a production requirement.
- Payment is simulated; no credit card data, PSP secret or real charge exists.
  There is no fulfillment, tax jurisdiction, real invoice or consent lifecycle.
- Learning counters are demo telemetry; no personal customer data is published.
  A real deployment needs consent, deletion/export, attribution and abuse
  protection before enabling behavior tracking.
