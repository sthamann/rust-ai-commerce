SET search_path = public;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS product_root_page ON products(tenant,id) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS product_category_page ON products(tenant,category,id) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS product_variant_page ON products(tenant,parent_id,id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_search_substring ON products USING gin(lower(name||' '||description) gin_trgm_ops) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS translation_search_substring ON product_translations USING gin(lower(coalesce(name,'')||' '||coalesce(description,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tenant_recent_orders ON orders(tenant,created_at DESC,id);
CREATE INDEX IF NOT EXISTS tenant_exposure_date ON exposures(tenant,created_at);
