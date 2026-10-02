-- Versioned tenant apps, replayable observations, short chat leases and payment jobs.
SET search_path = public;
CREATE TABLE IF NOT EXISTS app_packages (
 tenant text NOT NULL REFERENCES tenants(id), id text NOT NULL, version text NOT NULL,
 manifest jsonb NOT NULL, digest text NOT NULL, active boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1, installed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id)
);
CREATE TABLE IF NOT EXISTS app_versions (
 tenant text NOT NULL, app text NOT NULL, version text NOT NULL, digest text NOT NULL, manifest jsonb NOT NULL,
 installed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,app,version)
);
CREATE TABLE IF NOT EXISTS app_deliveries (
 tenant text NOT NULL, app text NOT NULL, event_id bigint NOT NULL REFERENCES outbox(id),
 state text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz, available_at timestamptz NOT NULL DEFAULT now(), error text,
 PRIMARY KEY(tenant,app,event_id), FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id)
);
CREATE TABLE IF NOT EXISTS knowledge_receipts (
 tenant text NOT NULL, event_id bigint NOT NULL REFERENCES outbox(id), PRIMARY KEY(tenant,event_id)
);
CREATE TABLE IF NOT EXISTS observed_pairs (
 tenant text NOT NULL, left_id text NOT NULL, right_id text NOT NULL, orders bigint NOT NULL,
 last_event bigint NOT NULL REFERENCES outbox(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,left_id,right_id), CHECK(left_id < right_id)
);
CREATE TABLE IF NOT EXISTS pair_evidence (
 tenant text NOT NULL, left_id text NOT NULL, right_id text NOT NULL, order_id text NOT NULL,
 event_id bigint NOT NULL REFERENCES outbox(id), simulated boolean NOT NULL,
 PRIMARY KEY(tenant,left_id,right_id,order_id)
);
CREATE TABLE IF NOT EXISTS knowledge_hypotheses (
 tenant text NOT NULL, id text NOT NULL, kind text NOT NULL, evidence jsonb NOT NULL,
 state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','dismissed','experiment')),
 revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,id)
);
ALTER TABLE knowledge_hypotheses DROP CONSTRAINT IF EXISTS knowledge_hypotheses_state_check;
ALTER TABLE knowledge_hypotheses ADD CONSTRAINT knowledge_hypotheses_state_check CHECK(state IN ('proposed','dismissed','experiment','published'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS turn_owner text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS turn_until timestamptz;
CREATE TABLE IF NOT EXISTS payment_attempts (
 id text PRIMARY KEY, tenant text NOT NULL, order_id text NOT NULL UNIQUE REFERENCES orders(id),
 provider text NOT NULL, adapter_version text NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency text NOT NULL CHECK(currency='EUR'), state text NOT NULL DEFAULT 'pending',
 provider_order text, approval_url text, capture_id text, refunded_minor bigint NOT NULL DEFAULT 0,
 revision bigint NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant,id)
);
CREATE TABLE IF NOT EXISTS inventory_reservations (
 tenant text NOT NULL, attempt_id text NOT NULL REFERENCES payment_attempts(id), product_id text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), released boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant,attempt_id,product_id), FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id)
);
CREATE TABLE IF NOT EXISTS payment_jobs (
 id text PRIMARY KEY, tenant text NOT NULL, attempt_id text NOT NULL REFERENCES payment_attempts(id),
 operation text NOT NULL, request jsonb NOT NULL DEFAULT '{}', fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'queued', lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), response jsonb, error text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant,id)
);
CREATE INDEX IF NOT EXISTS payment_jobs_pending ON payment_jobs(available_at) WHERE state IN ('queued','running');
CREATE TABLE IF NOT EXISTS payment_inbox (
 tenant text NOT NULL, provider text NOT NULL, event_id text NOT NULL, data jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,provider,event_id)
);
-- The fixed lexical index accelerates bounded model context; vector ranking remains exact.
CREATE INDEX IF NOT EXISTS products_search ON products USING gin(to_tsvector('simple',name||' '||description));

ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';
-- Replay old order events through the new projection once, preserving the original event IDs.
UPDATE outbox e SET delivered_at=NULL WHERE kind IN ('order.placed','payment.captured') AND NOT EXISTS(SELECT 1 FROM knowledge_receipts r WHERE r.tenant=e.tenant AND r.event_id=e.id);
