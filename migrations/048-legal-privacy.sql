-- Necessary session receipts and durable consumer requests are private tenant data.
CREATE TABLE privacy_consents (
 tenant text NOT NULL REFERENCES tenants(id), cart_id text NOT NULL, channel_id text NOT NULL,
 policy_version text NOT NULL, data jsonb NOT NULL, expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant,cart_id,channel_id),
 FOREIGN KEY(tenant,cart_id) REFERENCES carts(tenant,id),
 FOREIGN KEY(tenant,channel_id) REFERENCES sales_channels(tenant,id)
);
CREATE TABLE privacy_consent_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant text NOT NULL REFERENCES tenants(id),
 cart_id text NOT NULL, channel_id text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant,cart_id) REFERENCES carts(tenant,id), FOREIGN KEY(tenant,channel_id) REFERENCES sales_channels(tenant,id)
);
CREATE INDEX privacy_consent_log_scope ON privacy_consent_log(tenant,cart_id,created_at DESC);
CREATE TABLE legal_acceptances (
 tenant text NOT NULL REFERENCES tenants(id), cart_id text NOT NULL, data jsonb NOT NULL,
 PRIMARY KEY(tenant,cart_id), FOREIGN KEY(tenant,cart_id) REFERENCES carts(tenant,id)
);
CREATE TABLE consumer_requests (
 tenant text NOT NULL REFERENCES tenants(id), id text NOT NULL, cart_id text NOT NULL, channel_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('withdrawal','access','erase','correct','portability','objection')),
 data jsonb NOT NULL, state text NOT NULL DEFAULT 'received' CHECK(state IN ('received','in_review','completed','declined')),
 revision bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id), FOREIGN KEY(tenant,cart_id) REFERENCES carts(tenant,id), FOREIGN KEY(tenant,channel_id) REFERENCES sales_channels(tenant,id)
);
CREATE INDEX consumer_requests_scope ON consumer_requests(tenant,created_at DESC,id);
CREATE TABLE consumer_request_reviews (
 tenant text NOT NULL, request_id text NOT NULL, revision bigint NOT NULL, actor text NOT NULL,
 state text NOT NULL, note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,request_id,revision), FOREIGN KEY(tenant,request_id) REFERENCES consumer_requests(tenant,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['privacy_consents','privacy_consent_log','legal_acceptances','consumer_requests','consumer_request_reviews'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY core_tenant_scope ON %I USING(current_setting(''rac.system'',true)=''on'' OR tenant=nullif(current_setting(''rac.tenant'',true),'''')) WITH CHECK(current_setting(''rac.system'',true)=''on'' OR tenant=nullif(current_setting(''rac.tenant'',true),''''))',t);
 END LOOP;
END $$;
