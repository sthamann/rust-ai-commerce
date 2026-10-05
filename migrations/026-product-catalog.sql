-- Native hierarchical categories and tenant-safe product assignments. Existing products stay active.
ALTER TABLE products ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN product_number text;
UPDATE products SET product_number=id;
CREATE UNIQUE INDEX product_number_unique ON products(tenant,product_number);
CREATE TABLE categories (
 tenant text NOT NULL, id text NOT NULL, parent_id text, position integer NOT NULL DEFAULT 0,
 data jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant,id), FOREIGN KEY(tenant,parent_id) REFERENCES categories(tenant,id),
 CHECK(parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX category_children ON categories(tenant,parent_id,position,id);
CREATE TABLE product_categories (
 tenant text NOT NULL, product_id text NOT NULL, category_id text NOT NULL,
 PRIMARY KEY(tenant,product_id,category_id),
 FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id),
 FOREIGN KEY(tenant,category_id) REFERENCES categories(tenant,id)
);
CREATE INDEX category_products ON product_categories(tenant,category_id,product_id);
INSERT INTO categories(tenant,id,data)
 SELECT DISTINCT tenant,'catalog-root','{"active":true,"visible":true,"type":"page","translations":{"en":{"name":"Catalog"},"de":{"name":"Katalog"},"fr":{"name":"Catalogue"},"es":{"name":"Catálogo"}}}'::jsonb FROM products;
INSERT INTO categories(tenant,id,parent_id,data)
 SELECT DISTINCT tenant, 'legacy-'||md5(category),'catalog-root',jsonb_build_object('active',true,'visible',true,'type','page','translations',jsonb_build_object('en',jsonb_build_object('name',initcap(category)),'de',jsonb_build_object('name',CASE category WHEN 'furniture' THEN 'Möbel' WHEN 'lighting' THEN 'Leuchten' WHEN 'objects' THEN 'Accessoires' ELSE initcap(category) END),'fr',jsonb_build_object('name',CASE category WHEN 'furniture' THEN 'Meubles' WHEN 'lighting' THEN 'Éclairage' WHEN 'objects' THEN 'Accessoires' ELSE initcap(category) END),'es',jsonb_build_object('name',CASE category WHEN 'furniture' THEN 'Muebles' WHEN 'lighting' THEN 'Iluminación' WHEN 'objects' THEN 'Accesorios' ELSE initcap(category) END))) FROM products;
INSERT INTO product_categories SELECT tenant,id,'legacy-'||md5(category) FROM products;
CREATE TABLE product_channel_visibility (
 tenant text NOT NULL,product_id text NOT NULL,channel_id text NOT NULL,visible boolean NOT NULL,
 PRIMARY KEY(tenant,product_id,channel_id),
 FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id),
 FOREIGN KEY(tenant,channel_id) REFERENCES sales_channels(tenant,id)
);
CREATE INDEX product_channel_hidden ON product_channel_visibility(tenant,channel_id,product_id) WHERE NOT visible;
