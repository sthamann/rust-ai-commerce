-- Immediate App Studio preview is a personal, expiring existing staging environment, never a release source.
ALTER TABLE shop_environments ADD COLUMN preview_owner text REFERENCES merchant_users(id);
ALTER TABLE shop_environments ADD COLUMN preview_until timestamptz;
ALTER TABLE shop_environments ADD CONSTRAINT preview_owner_expiry CHECK((preview_owner IS NULL)=(preview_until IS NULL));
CREATE UNIQUE INDEX app_preview_owner ON shop_environments(live_tenant,preview_owner) WHERE preview_owner IS NOT NULL;
