-- Rebuildable diagnostic projection: source-job changes and exact per-code totals commit together.
LOCK TABLE embedding_jobs IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE knowledge_index_status ADD COLUMN errors jsonb NOT NULL DEFAULT '{}';
UPDATE knowledge_index_status s SET errors=coalesce((
 SELECT jsonb_object_agg(code,n) FROM (
  SELECT error_code AS code,count(*) AS n FROM embedding_jobs
  WHERE tenant=s.tenant AND error_code IS NOT NULL GROUP BY error_code
 ) grouped
),'{}'::jsonb);

CREATE FUNCTION cognitive_error_delta() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_code text; new_code text; old_shop text; new_shop text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_code=OLD.error_code; old_shop=OLD.tenant; END IF;
 IF TG_OP<>'DELETE' THEN new_code=NEW.error_code; new_shop=NEW.tenant; END IF;
 IF old_code IS NOT DISTINCT FROM new_code AND old_shop IS NOT DISTINCT FROM new_shop THEN RETURN NULL; END IF;
 IF old_code IS NOT NULL THEN
  UPDATE knowledge_index_status SET errors=CASE
   WHEN coalesce((errors->>old_code)::bigint,0)<=1 THEN errors-old_code
   ELSE jsonb_set(errors,ARRAY[old_code],to_jsonb((errors->>old_code)::bigint-1)) END
  WHERE tenant=old_shop;
 END IF;
 IF new_code IS NOT NULL AND EXISTS(SELECT 1 FROM tenants WHERE id=new_shop) THEN
  INSERT INTO knowledge_index_status(tenant) VALUES(new_shop) ON CONFLICT DO NOTHING;
  UPDATE knowledge_index_status SET errors=jsonb_set(errors,ARRAY[new_code],to_jsonb(coalesce((errors->>new_code)::bigint,0)+1))
  WHERE tenant=new_shop;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER cognitive_status_errors AFTER INSERT OR DELETE OR UPDATE OF error_code,tenant ON embedding_jobs
 FOR EACH ROW EXECUTE FUNCTION cognitive_error_delta();
