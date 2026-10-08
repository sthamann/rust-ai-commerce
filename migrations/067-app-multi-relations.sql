-- Multi-value fields retain JSON wire values and materialize tenant-owned, deferred composite FKs.
-- SECURITY INVOKER: app data, relation links and quotas all run under the caller's tenant RLS.
CREATE FUNCTION app_sync_relations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE links text; values_json jsonb; item text; ordinal bigint;
BEGIN
 links := TG_ARGV[0]; values_json := to_jsonb(NEW)->TG_ARGV[1];
 IF TG_TABLE_NAME<>TG_ARGV[2] OR NEW.tenant<>current_setting('rac.tenant',true) THEN
   RAISE EXCEPTION 'App relation tenant/table mismatch' USING ERRCODE='42501';
 END IF;
 EXECUTE format('DELETE FROM public.%I WHERE tenant=$1 AND source_id=$2',links) USING NEW.tenant,NEW.id;
 IF values_json IS NOT NULL AND values_json<>'null'::jsonb THEN
   IF jsonb_typeof(values_json)<>'array' OR jsonb_array_length(values_json)>100 THEN
     RAISE EXCEPTION 'App relations require at most 100 record IDs' USING ERRCODE='23514';
   END IF;
   FOR item,ordinal IN SELECT value, ordinality FROM jsonb_array_elements_text(values_json) WITH ORDINALITY LOOP
     EXECUTE format('INSERT INTO public.%I(tenant,source_id,target_id,position) VALUES($1,$2,$3,$4)',links)
       USING NEW.tenant,NEW.id,item,ordinal;
   END LOOP;
 END IF;
 RETURN NEW;
END $$;
