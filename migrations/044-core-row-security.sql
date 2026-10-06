-- Defense in depth on every current public tenant table. Runtime identity must be
-- non-owner/NOBYPASSRLS; migration owner is a separate credential. No client may
-- supply rac.system/rac.tenant: pool hooks derive them from admitted task scope.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
    AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='tenant_scope' AND c.relname ~ '^app_[a-f0-9]{16}_')
    AND EXISTS(
      SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.relname);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t.relname);
    EXECUTE format('CREATE POLICY core_tenant_scope ON public.%I USING (current_setting(''rac.system'',true)=''on'' OR tenant::text=nullif(current_setting(''rac.tenant'',true),'''')) WITH CHECK (current_setting(''rac.system'',true)=''on'' OR tenant::text=nullif(current_setting(''rac.tenant'',true),''''))',t.relname);
  END LOOP;
END $$;
