-- Declarative workspace order workflows and exact-once transition receipts.
CREATE TABLE order_state_machines (
 tenant text PRIMARY KEY REFERENCES tenants(id),
 data jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1
);
CREATE TABLE order_transition_requests (
 tenant text NOT NULL REFERENCES tenants(id), request_key text NOT NULL,
 order_id text NOT NULL REFERENCES orders(id), fingerprint text NOT NULL,
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant,request_key)
);
