-- Execute with the migration/DB owner before enabling DB_RLS_REQUIRED=true.
-- This group has no password. Create a separate LOGIN via your secret manager,
-- grant this role to it, and use that login only for DATABASE_RUNTIME_URL.
-- Runtime login must inherit this group, but NEVER the migration owner.
CREATE ROLE vendune_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT,CREATE ON DATABASE :"DBNAME" TO vendune_runtime;
GRANT USAGE,CREATE ON SCHEMA public TO vendune_runtime;
SELECT format('GRANT SELECT,INSERT,UPDATE,DELETE,REFERENCES ON public.%I TO vendune_runtime',tablename) FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'connector_%' \gexec
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO vendune_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM vendune_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO vendune_runtime;
-- Only app-managed schema ownership is transferable; never transfer commerce tables.
-- Migration owner must be a member of the app-schema owner to perform the transfer.
SELECT format('GRANT vendune_runtime TO %I',current_user) \gexec
SELECT format('ALTER TABLE public.%I OWNER TO vendune_runtime',c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname ~ '^app_[a-f0-9]{16}([a-f0-9]{8})?_'
 AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='tenant_scope') \gexec
-- Example, after provisioning the LOGIN separately:
-- GRANT vendune_runtime TO vendune_runtime_login;
-- DB_RLS_REQUIRED=true
-- DATABASE_RUNTIME_URL=postgres://vendune_runtime_login:<secret>@<host>/<database>
-- DATABASE_URL remains the migration owner and is not given to apps/browsers.
