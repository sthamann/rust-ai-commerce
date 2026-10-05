-- Sparse field overrides use stable method/class IDs, preserving inheritance after basis edits.
CREATE TABLE commerce_overrides (
 tenant text NOT NULL, channel_id text NOT NULL, data jsonb NOT NULL DEFAULT '[]',
 revision bigint NOT NULL DEFAULT 1, PRIMARY KEY(tenant,channel_id),
 FOREIGN KEY(tenant,channel_id) REFERENCES sales_channels(tenant,id) ON DELETE CASCADE,
 CHECK(jsonb_typeof(data)='array')
);
