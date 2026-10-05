-- Recoverable App Studio project removal preserves immutable versions and installed packages.
ALTER TABLE developer_builds ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE developer_builds ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS developer_builds_library ON developer_builds(tenant, archived, created_at DESC);
