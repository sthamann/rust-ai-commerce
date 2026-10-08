-- Preserve existing credentials; newly broker-provisioned accounts explicitly require enrollment.
-- Legacy hashes cannot reliably identify random provisioning passwords: verified-link recovery handles those.
ALTER TABLE merchant_users ADD COLUMN password_initialized boolean NOT NULL DEFAULT true;
