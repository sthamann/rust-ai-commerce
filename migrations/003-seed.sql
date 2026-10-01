-- Synthetic merchandising examples, initialized once without overwriting edits.
CREATE TABLE IF NOT EXISTS seed_versions (version text PRIMARY KEY);
UPDATE products SET list_price=89.9,regulation_price=79.9 WHERE id='lamp' AND NOT EXISTS (SELECT 1 FROM seed_versions WHERE version='price-metadata-v2');
UPDATE products SET reference_price='{"purchase_unit":120,"reference_unit":100,"unit_name":"pages"}' WHERE id='notebook' AND NOT EXISTS (SELECT 1 FROM seed_versions WHERE version='price-metadata-v2');
INSERT INTO seed_versions(version) VALUES('price-metadata-v2') ON CONFLICT DO NOTHING;
