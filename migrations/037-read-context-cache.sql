-- Authoritative cache identities change atomically for every write, including restore and direct SQL.
ALTER TABLE commerce_settings ADD COLUMN cache_version uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE commerce_overrides ADD COLUMN cache_version uuid NOT NULL DEFAULT gen_random_uuid();
CREATE FUNCTION stamp_read_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.cache_version := gen_random_uuid();
    RETURN NEW;
END;
$$;
CREATE TRIGGER commerce_settings_cache_version BEFORE INSERT OR UPDATE ON commerce_settings
    FOR EACH ROW EXECUTE FUNCTION stamp_read_context();
CREATE TRIGGER commerce_overrides_cache_version BEFORE INSERT OR UPDATE ON commerce_overrides
    FOR EACH ROW EXECUTE FUNCTION stamp_read_context();
CREATE TABLE read_context_versions(namespace text PRIMARY KEY, version uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO read_context_versions(namespace) VALUES('languages');
CREATE FUNCTION stamp_language_registry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE read_context_versions SET version=gen_random_uuid() WHERE namespace='languages';
    RETURN NULL;
END;
$$;
CREATE FUNCTION stamp_new_languages() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- ON CONFLICT DO NOTHING is frequent during provisioning. Avoid a global lock
    -- and fleet-wide invalidation when the statement inserted no language rows.
    IF EXISTS(SELECT 1 FROM changed_languages) THEN
        UPDATE read_context_versions SET version=gen_random_uuid() WHERE namespace='languages';
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER languages_insert_cache_version AFTER INSERT ON languages
    REFERENCING NEW TABLE AS changed_languages FOR EACH STATEMENT EXECUTE FUNCTION stamp_new_languages();
CREATE TRIGGER languages_cache_version AFTER UPDATE OR DELETE OR TRUNCATE ON languages
    FOR EACH STATEMENT EXECUTE FUNCTION stamp_language_registry();
