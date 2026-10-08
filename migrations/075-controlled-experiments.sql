-- Randomized cart-unit experiments and private consent-bound preferences. Not an order/payment ledger.
CREATE TABLE intelligence_experiments(
 tenant text NOT NULL REFERENCES tenants(id),id text NOT NULL,channel text NOT NULL,
 data jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,state text NOT NULL CHECK(state IN ('draft','running','stopped','completed')),
 withdrawn integer NOT NULL DEFAULT 0 CHECK(withdrawn>=0),actor text NOT NULL,started_at timestamptz,ends_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id),FOREIGN KEY(tenant,channel) REFERENCES sales_channels(tenant,id)
);
CREATE UNIQUE INDEX intelligence_one_experiment ON intelligence_experiments(tenant,channel) WHERE state='running';
CREATE TABLE intelligence_assignments(
 tenant text NOT NULL,experiment_id text NOT NULL,cart_id text NOT NULL,arm integer NOT NULL CHECK(arm IN (0,1)),
 baseline double precision NOT NULL CHECK(baseline BETWEEN 0 AND 1),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,experiment_id,cart_id),
 FOREIGN KEY(tenant,experiment_id) REFERENCES intelligence_experiments(tenant,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant,cart_id) REFERENCES carts(tenant,id) ON DELETE CASCADE
);
CREATE TABLE private_preferences(
 tenant text NOT NULL,cart_id text NOT NULL,data jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant,cart_id),
 FOREIGN KEY(tenant,cart_id) REFERENCES carts(tenant,id) ON DELETE CASCADE
);
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['intelligence_experiments','intelligence_assignments','private_preferences'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY core_tenant_scope ON %I USING(current_setting(''rac.system'',true)=''on'' OR tenant=nullif(current_setting(''rac.tenant'',true),'''')) WITH CHECK(current_setting(''rac.system'',true)=''on'' OR tenant=nullif(current_setting(''rac.tenant'',true),''''))',t);
END LOOP;END$$;
CREATE INDEX intelligence_assignments_time ON intelligence_assignments(tenant,experiment_id,created_at);
CREATE INDEX intelligence_live_payment_cart ON payment_attempts(tenant,order_id) WHERE environment='live' AND state IN ('captured','captured_late','refunded');
-- Timestamp the native first capture transition; do not manufacture dates for historical receipts.
ALTER TABLE payment_attempts ADD COLUMN capture_confirmed_at timestamptz;
CREATE FUNCTION intelligence_capture_clock() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF NEW.environment='live' AND NEW.state IN ('captured','captured_late') AND NEW.capture_id IS NOT NULL
 AND NEW.capture_confirmed_at IS NULL THEN NEW.capture_confirmed_at=now();END IF;
 IF TG_OP='UPDATE' AND OLD.capture_confirmed_at IS NOT NULL THEN NEW.capture_confirmed_at=OLD.capture_confirmed_at;END IF;
 RETURN NEW;END$$;
CREATE TRIGGER intelligence_capture_clock BEFORE INSERT OR UPDATE ON payment_attempts FOR EACH ROW EXECUTE FUNCTION intelligence_capture_clock();
ALTER TABLE intelligence_experiments ADD COLUMN final_report jsonb;
