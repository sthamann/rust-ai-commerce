-- Immutable provider identity and exact receipt allocation for arbitrary payment apps.
ALTER TABLE payment_attempts ADD COLUMN provider_context jsonb NOT NULL DEFAULT '{}';
CREATE TABLE payment_provider_accounts (
 tenant text NOT NULL, app text NOT NULL, channel text NOT NULL DEFAULT 'default',
 account_ref text NOT NULL, environment text NOT NULL CHECK(environment IN ('sandbox','live','contract-fixture')),
 ready boolean NOT NULL DEFAULT false, data jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,app,channel),
 FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id),
 FOREIGN KEY(tenant,channel) REFERENCES sales_channels(tenant,id)
);
CREATE TABLE payment_receipt_claims (
 provider text NOT NULL, environment text NOT NULL, account_ref text NOT NULL,
 kind text NOT NULL, receipt_ref text NOT NULL, tenant text NOT NULL, attempt_id text NOT NULL,
 job_key text NOT NULL, PRIMARY KEY(provider,environment,account_ref,kind,receipt_ref),
 FOREIGN KEY(tenant,attempt_id) REFERENCES payment_attempts(tenant,id)
);
