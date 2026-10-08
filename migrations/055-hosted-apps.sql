-- Existing pre-055 hosted mounts were created by the Storyfront/Experience integration.
-- The migration runner installs the immutable bundled package through the normal installer before commit.
ALTER TABLE hosted_frontends ADD COLUMN app_id text;
UPDATE hosted_frontends SET app_id='storyfront';
ALTER TABLE hosted_frontends ADD CONSTRAINT hosted_frontends_app_fk
 FOREIGN KEY(tenant,app_id) REFERENCES app_packages(tenant,id) ON DELETE RESTRICT
 DEFERRABLE INITIALLY DEFERRED NOT VALID;
CREATE INDEX hosted_frontends_app ON hosted_frontends(tenant,app_id) WHERE app_id IS NOT NULL;
