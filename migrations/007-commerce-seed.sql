INSERT INTO commerce_settings(tenant,data)
SELECT tenant, '{"countries":["DE","AT","FR","ES"],"taxes":[{"id":"standard","rates":{"DE":19,"AT":20,"FR":20,"ES":21}},{"id":"reduced","rates":{"DE":7,"AT":10,"FR":5.5,"ES":4}}],"shipping":[{"id":"pickup","name":"pickup","price":0,"freeAbove":null,"minDays":0,"maxDays":0,"countries":["DE","AT","FR","ES"],"active":true,"taxType":"highest"},{"id":"standard","name":"standard","price":4.9,"freeAbove":150,"minDays":2,"maxDays":4,"countries":["DE","AT","FR","ES"],"active":true,"taxType":"proportional"},{"id":"express","name":"express","price":12.9,"freeAbove":null,"minDays":1,"maxDays":2,"countries":["DE","AT"],"active":true,"taxType":"highest"}],"payments":[{"id":"demo-card","name":"card","active":true,"businessOnly":false,"mode":"simulated"},{"id":"bank-transfer","name":"bank","active":true,"businessOnly":false,"mode":"manual"},{"id":"invoice","name":"invoice","active":true,"businessOnly":true,"mode":"manual"}]}'::jsonb
FROM (VALUES('atelier'),('workshop')) t(tenant) ON CONFLICT DO NOTHING;
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM seed_versions WHERE version='commerce-v4') THEN
 UPDATE products SET media=jsonb_build_array(
  jsonb_build_object('id',id||'-front','url','/media/'||id||'-front.svg','view','front'),
  jsonb_build_object('id',id||'-detail','url','/media/'||id||'-detail.svg','view','detail'),
  jsonb_build_object('id',id||'-space','url','/media/'||id||'-space.svg','view','space')),
 properties=CASE id WHEN 'chair' THEN '{"material":"oak-linen","width":"54 cm","height":"78 cm","weight":"6.5 kg"}'::jsonb WHEN 'desk' THEN '{"material":"oak","width":"120 cm","height":"74 cm","weight":"18 kg"}'::jsonb WHEN 'lamp' THEN '{"material":"steel","height":"48 cm","power":"8 W LED"}'::jsonb WHEN 'mug' THEN '{"material":"stoneware","volume":"350 ml","care":"dishwasher"}'::jsonb WHEN 'notebook' THEN '{"material":"recycled-paper","size":"A5","pages":"160"}'::jsonb ELSE '{"material":"oak","width":"80 cm","height":"110 cm"}'::jsonb END,
 options=CASE id WHEN 'mug' THEN '{"color":"terracotta","size":"350"}'::jsonb WHEN 'chair' THEN '{"color":"natural","material":"oak"}'::jsonb ELSE '{}'::jsonb END;
 -- Existing base IDs remain purchasable SKUs, including all existing carts.
 INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock,parent_id,options,media,properties,delivery_days,list_price,regulation_price,advanced_prices,min_purchase,purchase_steps,max_purchase)
 SELECT tenant,id||'-'||v.suffix,name,category,description,price+v.delta,tax_rate,v.stock,id,v.options,
 media,properties,delivery_days,list_price,regulation_price,advanced_prices,min_purchase,purchase_steps,max_purchase
 FROM products CROSS JOIN (VALUES
 ('mug','sage-350','{"color":"sage","size":"350"}'::jsonb,0.0,36),
 ('mug','terracotta-500','{"color":"terracotta","size":"500"}'::jsonb,5.0,24),
 ('mug','sage-500','{"color":"sage","size":"500"}'::jsonb,5.0,0),
 ('chair','dark-oak','{"color":"dark","material":"oak"}'::jsonb,20.0,12),
 ('chair','natural-walnut','{"color":"natural","material":"walnut"}'::jsonb,40.0,8)
 ) v(base,suffix,options,delta,stock) WHERE products.id=v.base AND products.parent_id IS NULL
 ON CONFLICT DO NOTHING;
 -- Public quantity tiers complement authenticated B2B prices.
 UPDATE products SET advanced_prices=advanced_prices||'[{"rule_id":"consumer","quantity_start":1,"quantity_end":5,"discount":0},{"rule_id":"consumer","quantity_start":6,"quantity_end":11,"discount":0.05},{"rule_id":"consumer","quantity_start":12,"quantity_end":null,"discount":0.1}]'::jsonb WHERE id='mug' OR parent_id='mug';
 INSERT INTO product_reviews(id,tenant,product_id,session,author,rating,title,content,approved,demo)
 SELECT tenant||'-mug-demo',tenant,'mug','seed-v4','Alex',5,'Schöne Form, angenehme Haptik','Kuratiertes Beispiel: Die Tasse liegt angenehm in der Hand.',true,true
 FROM commerce_settings ON CONFLICT DO NOTHING;
 UPDATE products SET media=jsonb_build_array(jsonb_build_object('id',id||'-front','url','/media/'||id||'-front.svg','view','front'),jsonb_build_object('id',id||'-detail','url','/media/'||id||'-detail.svg','view','detail'),jsonb_build_object('id',id||'-space','url','/media/'||id||'-space.svg','view','space')),properties=properties||CASE WHEN options->>'material'='walnut' THEN '{"material":"walnut"}'::jsonb ELSE '{}'::jsonb END WHERE parent_id IS NOT NULL;
 INSERT INTO seed_versions(version) VALUES('commerce-v4');
END IF;
END $$;
