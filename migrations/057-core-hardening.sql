-- Operational reliability metadata; existing commerce/audit references remain intact.
ALTER TABLE outbox ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0);
ALTER TABLE outbox ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE outbox ADD COLUMN dead_letter_at timestamptz;
ALTER TABLE outbox ADD COLUMN error_code text;
ALTER TABLE outbox ADD COLUMN payload_retired_at timestamptz;
CREATE INDEX outbox_ready ON outbox(available_at,id) WHERE delivered_at IS NULL AND dead_letter_at IS NULL;
CREATE INDEX outbox_retention ON outbox(delivered_at,id) WHERE payload_retired_at IS NULL AND delivered_at IS NOT NULL;
CREATE TABLE auth_attempt_buckets (
 key text PRIMARY KEY, window_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0, blocked_until timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE resource_leases (
 id text PRIMARY KEY, tenant text NOT NULL, class text NOT NULL,
 slots integer NOT NULL DEFAULT 1 CHECK(slots>0),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resource_lease_scope ON resource_leases(tenant,class,expires_at);
ALTER TABLE resource_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_leases FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON resource_leases
 USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''))
 WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
CREATE FUNCTION notify_work_ready() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR coalesce(to_jsonb(NEW)->>'state',to_jsonb(NEW)->>'status')='queued' OR TG_TABLE_NAME='outbox' AND to_jsonb(NEW)->>'delivered_at' IS NULL THEN
  PERFORM pg_notify('vendune_work_ready',TG_TABLE_NAME);
 END IF;
 RETURN NEW;
END $$;
DO $$DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['outbox','payment_jobs','app_deliveries','flow_jobs','translation_jobs','media_jobs','currency_price_jobs'] LOOP
  EXECUTE format('CREATE TRIGGER work_ready AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION notify_work_ready()',name);
 END LOOP;
END $$;

-- INVOKER keeps RLS active; separate statements after the advisory lock see committed contenders.
CREATE FUNCTION claim_resource_lease(p_id text,p_tenant text,p_class text,p_limit bigint,p_slots integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_slots<1 OR p_limit<1 THEN RAISE EXCEPTION 'Invalid resource budget'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resource:'||p_tenant||':'||p_class,817361));
 DELETE FROM resource_leases WHERE tenant=p_tenant AND class=p_class AND expires_at<=now();
 IF (SELECT coalesce(sum(slots),0) FROM resource_leases WHERE tenant=p_tenant AND class=p_class)+p_slots>p_limit THEN RETURN false; END IF;
 INSERT INTO resource_leases(id,tenant,class,expires_at,slots) VALUES(p_id,p_tenant,p_class,now()+interval '310 seconds',p_slots);
 RETURN true;
END $$;

CREATE INDEX outbox_metadata_expiry ON outbox(delivered_at,id) WHERE payload_retired_at IS NOT NULL;
CREATE INDEX app_deliveries_event_retention ON app_deliveries(event_id);
CREATE INDEX flow_jobs_event_retention ON flow_jobs(event_id);
CREATE INDEX knowledge_receipts_event_retention ON knowledge_receipts(event_id);
CREATE INDEX observed_pairs_event_retention ON observed_pairs(last_event);
CREATE INDEX pair_evidence_event_retention ON pair_evidence(event_id);
CREATE INDEX app_schedule_runs_event_retention ON app_schedule_runs(event_id);
CREATE INDEX app_webhook_receipts_event_retention ON app_webhook_receipts(event_id);
