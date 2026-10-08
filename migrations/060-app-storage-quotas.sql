-- Constant-time app storage accounting. Trigger checks also protect service and flow writes.
CREATE TABLE app_storage_usage (
 tenant text NOT NULL, app text NOT NULL, rows bigint NOT NULL DEFAULT 0,
 bytes bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,app), FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id),
 CHECK(rows>=0 AND rows<=100000), CHECK(bytes>=0 AND bytes<=67108864)
);
ALTER TABLE app_storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_storage_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app_storage_usage
 USING(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on')
 WITH CHECK(tenant=current_setting('rac.tenant',true) OR current_setting('rac.system',true)='on');
CREATE FUNCTION app_storage_accounting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE shop text; row_delta bigint; byte_delta bigint; expected_table text;
BEGIN
 shop := CASE WHEN TG_OP='DELETE' THEN OLD.tenant ELSE NEW.tenant END;
 expected_table := 'app_'||substr(encode(sha256(convert_to(shop||':'||TG_ARGV[0],'UTF8')),'hex'),1,24)||'_'||TG_ARGV[1];
 IF TG_TABLE_NAME<>expected_table OR (TG_OP='UPDATE' AND NEW.tenant<>OLD.tenant) THEN
   RAISE EXCEPTION 'App storage tenant/table mismatch' USING ERRCODE='42501';
 END IF;
 row_delta := CASE WHEN TG_OP='INSERT' THEN 1 WHEN TG_OP='DELETE' THEN -1 ELSE 0 END;
 byte_delta := CASE WHEN TG_OP='DELETE' THEN 0 ELSE octet_length(to_jsonb(NEW)::text) END
             - CASE WHEN TG_OP='INSERT' THEN 0 ELSE octet_length(to_jsonb(OLD)::text) END;
 -- UPDATE serializes concurrent writes against this app's quota, independent of other tenants.
 UPDATE app_storage_usage SET rows=rows+row_delta,bytes=bytes+byte_delta,updated_at=now()
 WHERE tenant=shop AND app=TG_ARGV[0];
 IF NOT FOUND THEN RAISE EXCEPTION 'App storage quota is not initialized' USING ERRCODE='42501'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$
DECLARE p record; e jsonb; name text; count_rows bigint; count_bytes bigint;
BEGIN
 FOR p IN SELECT tenant,id,manifest FROM app_packages LOOP
   PERFORM set_config('rac.tenant',p.tenant,true);
   INSERT INTO app_storage_usage(tenant,app) VALUES(p.tenant,p.id);
   FOR e IN SELECT value FROM jsonb_array_elements(p.manifest->'entities') LOOP
     name := 'app_'||substr(encode(sha256(convert_to(p.tenant||':'||p.id,'UTF8')),'hex'),1,24)||'_'||(e->>'name');
     EXECUTE format('SELECT count(*),COALESCE(sum(octet_length(to_jsonb(r)::text)),0) FROM public.%I r WHERE tenant=$1',name) INTO count_rows,count_bytes USING p.tenant;
     UPDATE app_storage_usage SET rows=rows+count_rows,bytes=bytes+count_bytes WHERE tenant=p.tenant AND app=p.id;
     EXECUTE format('CREATE TRIGGER app_storage_quota AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_storage_accounting(%L,%L)',name,p.id,e->>'name');
   END LOOP;
 END LOOP;
END $$;
