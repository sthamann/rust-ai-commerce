-- PostgreSQL delivers NOTIFY only after commit; rollback cannot evict an authoritative snapshot.
CREATE FUNCTION notify_outbox_cache() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('vendune_read_invalidation',json_build_object('tenant',NEW.tenant)::text);
 RETURN NEW;
END $$;
CREATE TRIGGER outbox_cache_notification AFTER INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION notify_outbox_cache();
CREATE FUNCTION emit_read_cache_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 INSERT INTO outbox(tenant,kind,data) VALUES(NEW.tenant,'cache.invalidate',jsonb_build_object('namespace',TG_TABLE_NAME));
 RETURN NEW;
END $$;
CREATE TRIGGER settings_cache_event AFTER INSERT OR UPDATE ON commerce_settings FOR EACH ROW EXECUTE FUNCTION emit_read_cache_event();
CREATE TRIGGER overrides_cache_event AFTER INSERT OR UPDATE ON commerce_overrides FOR EACH ROW EXECUTE FUNCTION emit_read_cache_event();
