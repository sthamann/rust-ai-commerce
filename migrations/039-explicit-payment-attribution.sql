-- Provider attribution is supplied by private connector configuration, never a public default.
-- Historical attempt snapshots remain immutable for reconciliation.
ALTER TABLE payment_attempts ALTER COLUMN bn_code DROP DEFAULT;
