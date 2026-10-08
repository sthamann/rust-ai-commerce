-- One frontend registry, revisioned aliases and session-bound, short-lived merchant previews.
ALTER TABLE hosted_frontends ADD COLUMN experience_alias text;
UPDATE hosted_frontends SET experience_alias=alias;
ALTER TABLE hosted_frontends ALTER COLUMN experience_alias SET NOT NULL;
ALTER TABLE hosted_frontends ADD COLUMN revision bigint NOT NULL DEFAULT 1;
CREATE TABLE channel_previews (
 digest text PRIMARY KEY, tenant text NOT NULL, channel text NOT NULL,
 session_digest text NOT NULL REFERENCES user_sessions(digest) ON DELETE CASCADE,
 channel_revision bigint NOT NULL, alias text, redeemed boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 FOREIGN KEY(tenant,channel) REFERENCES sales_channels(tenant,id) ON DELETE CASCADE
);
CREATE INDEX channel_previews_expiry ON channel_previews(expires_at);
ALTER TABLE channel_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_previews FORCE ROW LEVEL SECURITY;
CREATE POLICY channel_preview_tenant ON channel_previews USING
 (current_setting('rac.system',true)='on' OR tenant=current_setting('rac.tenant',true))
 WITH CHECK (current_setting('rac.system',true)='on' OR tenant=current_setting('rac.tenant',true));
