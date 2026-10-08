-- Split historical shared app tables into tenant-owned contracts. Preserve old tables as backup.
DO $$
DECLARE
    package record; entity jsonb; field jsonb; target text; legacy text;
    columns text; definition text; sql_type text; constraint_name text;
BEGIN
    FOR package IN SELECT tenant,id,manifest FROM app_packages ORDER BY tenant,id LOOP
        PERFORM set_config('rac.tenant',package.tenant,true);
        FOR entity IN SELECT value FROM jsonb_array_elements(package.manifest->'entities') LOOP
            IF entity->>'name' !~ '^[a-z][a-z0-9_]{0,31}$' THEN
                RAISE EXCEPTION 'Invalid app entity during tenant schema migration';
            END IF;
            target := 'app_' || substr(encode(sha256(convert_to(package.tenant||':'||package.id,'UTF8')),'hex'),1,24) || '_' || (entity->>'name');
            legacy := 'app_' || substr(encode(sha256(convert_to(package.id,'UTF8')),'hex'),1,16) || '_' || (entity->>'name');
            -- Build only this tenant's declared columns, never clone another tenant's NOT NULL columns.
            columns := 'tenant,id,revision';
            definition := 'tenant text NOT NULL REFERENCES public.tenants(id),id text NOT NULL,revision bigint NOT NULL DEFAULT 1,PRIMARY KEY(tenant,id)';
            FOR field IN SELECT value FROM jsonb_array_elements(entity->'fields') LOOP
                IF field->>'name' !~ '^[a-z][a-z0-9_]{0,31}$' OR field->>'name' IN ('tenant','id','revision') THEN
                    RAISE EXCEPTION 'Invalid app field during tenant schema migration';
                END IF;
                sql_type := CASE WHEN COALESCE((field->>'translatable')::boolean,false) THEN 'jsonb'
                    WHEN field->>'kind'='integer' THEN 'bigint'
                    WHEN field->>'kind'='boolean' THEN 'boolean'
                    WHEN field->>'kind'='json' THEN 'jsonb' ELSE 'text' END;
                columns := columns || ',' || quote_ident(field->>'name');
                definition := definition || format(',%I %s %s',field->>'name',sql_type,
                    CASE WHEN COALESCE((field->>'required')::boolean,false) THEN 'NOT NULL' ELSE '' END);
            END LOOP;
            EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I(%s)',target,definition);
            IF to_regclass('public.'||legacy) IS NOT NULL THEN
                EXECUTE format('INSERT INTO public.%I(%s) SELECT %s FROM public.%I WHERE tenant=$1 ON CONFLICT(tenant,id) DO NOTHING',target,columns,columns,legacy) USING package.tenant;
            END IF;
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',target);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',target);
            IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=target AND policyname='tenant_scope') THEN
                EXECUTE format('CREATE POLICY tenant_scope ON public.%I USING(tenant=current_setting(''rac.tenant'',true)) WITH CHECK(tenant=current_setting(''rac.tenant'',true))',target);
            END IF;
            FOR field IN SELECT value FROM jsonb_array_elements(entity->'fields') LOOP
                IF COALESCE((field->>'indexed')::boolean,false) THEN
                    constraint_name := 'idx_'||substr(encode(sha256(convert_to(target||':'||(field->>'name'),'UTF8')),'hex'),1,20);
                    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant,%I)',constraint_name,target,field->>'name');
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
    -- All targets now exist; bind same-app relations to the tenant's new tables.
    FOR package IN SELECT tenant,id,manifest FROM app_packages ORDER BY tenant,id LOOP
        FOR entity IN SELECT value FROM jsonb_array_elements(package.manifest->'entities') LOOP
            target := 'app_' || substr(encode(sha256(convert_to(package.tenant||':'||package.id,'UTF8')),'hex'),1,24) || '_' || (entity->>'name');
            FOR field IN SELECT value FROM jsonb_array_elements(entity->'fields') LOOP
                IF field->>'references' IS NOT NULL THEN
                    IF field->>'references' !~ '^[a-z][a-z0-9_]{0,31}$' THEN
                        RAISE EXCEPTION 'Invalid app reference during tenant schema migration';
                    END IF;
                    legacy := 'app_' || substr(encode(sha256(convert_to(package.tenant||':'||package.id,'UTF8')),'hex'),1,24) || '_' || (field->>'references');
                    constraint_name := 'fk_'||substr(encode(sha256(convert_to(target||':'||(field->>'name'),'UTF8')),'hex'),1,20);
                    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.'||target) AND conname=constraint_name) THEN
                        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(tenant,%I) REFERENCES public.%I(tenant,id)',target,constraint_name,field->>'name',legacy);
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;
