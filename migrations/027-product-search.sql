-- Indexed merchant product name/number search; parent cursors remain the default path.
CREATE INDEX product_admin_name ON products USING gin(lower(name) gin_trgm_ops);
CREATE INDEX product_admin_number ON products USING gin(lower(product_number) gin_trgm_ops);
CREATE INDEX product_admin_translation_name ON product_translations USING gin(lower(coalesce(name,'')) gin_trgm_ops);
