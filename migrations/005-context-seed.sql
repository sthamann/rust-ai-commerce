UPDATE products SET advanced_prices='[{"rule_id":"business","quantity_start":1,"quantity_end":4,"discount":0.1},{"rule_id":"business","quantity_start":5,"quantity_end":null,"discount":0.15}]'
 WHERE NOT EXISTS(SELECT 1 FROM seed_versions WHERE version='context-v3');
-- Shelf demonstrates pack quantities without changing existing notebook/mug checkout cases.
UPDATE products SET min_purchase=2,purchase_steps=2,max_purchase=20 WHERE id='shelf'
 AND NOT EXISTS(SELECT 1 FROM seed_versions WHERE version='context-v3');
INSERT INTO product_translations(tenant,product_id,language_id,name,description)
SELECT p.tenant,p.id,t.language_id,t.name,t.description FROM products p JOIN (VALUES
 ('chair','11111111111111111111111111111111','Form Stuhl','Eichenholz und natürliches Leinen. Für ruhige Momente.'),
 ('desk','11111111111111111111111111111111','Plane Schreibtisch','Ein kompakter Schreibtisch aus Eiche mit integrierter Schublade.'),
 ('lamp','11111111111111111111111111111111','Arc Schreibtischleuchte','Warmes Leselicht mit verstellbarem Arm.'),
 ('mug','11111111111111111111111111111111','Terra Becher','Handgefertigte Keramik für den täglichen Kaffee.'),
 ('notebook','11111111111111111111111111111111','Field Notizbuch','Recyclingpapier und genähter Einband.'),
 ('shelf','11111111111111111111111111111111','Line Regal','Modulares Eichenregal für Wand oder Schreibtisch.'),
 ('chair','22222222222222222222222222222222','Chaise Form','Chêne et lin naturel pour les moments calmes.'),
 ('desk','22222222222222222222222222222222','Bureau Plane','Un bureau compact en chêne avec tiroir intégré.'),
 ('lamp','22222222222222222222222222222222','Lampe de bureau Arc','Une lumière de lecture chaleureuse avec bras réglable.'),
 ('mug','22222222222222222222222222222222','Tasse Terra','Céramique artisanale pour le café quotidien.'),
 ('notebook','22222222222222222222222222222222','Carnet Field','Papier recyclé et reliure cousue.'),
 ('shelf','22222222222222222222222222222222','Étagère Line','Rangement modulaire en chêne pour mur ou bureau.'),
 ('chair','33333333333333333333333333333333','Silla Form','Roble y lino natural para momentos tranquilos.'),
 ('desk','33333333333333333333333333333333','Escritorio Plane','Un escritorio compacto de roble con cajón integrado.'),
 ('lamp','33333333333333333333333333333333','Lámpara de escritorio Arc','Luz cálida de lectura con brazo ajustable.'),
 ('mug','33333333333333333333333333333333','Taza Terra','Cerámica artesanal para el café de cada día.'),
 ('notebook','33333333333333333333333333333333','Cuaderno Field','Papel reciclado y encuadernación cosida.'),
 ('shelf','33333333333333333333333333333333','Estante Line','Almacenamiento modular de roble para pared o escritorio.')
) AS t(product_id,language_id,name,description) ON p.id=t.product_id ON CONFLICT DO NOTHING;
INSERT INTO seed_versions(version) VALUES('context-v3') ON CONFLICT DO NOTHING;
