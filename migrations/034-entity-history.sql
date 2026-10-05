-- Durable entity snapshots from the actual database write path. No historical authors are invented.
SET search_path=public;
CREATE TABLE entity_history (
 id bigserial PRIMARY KEY,tenant text NOT NULL,entity text NOT NULL,entity_id text NOT NULL,
 transaction_id bigint NOT NULL,actor text,source text NOT NULL DEFAULT 'system',reason text,
 before_state jsonb,after_state jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant,entity,entity_id,transaction_id)
);
CREATE INDEX entity_history_lookup ON entity_history(tenant,entity,entity_id,id DESC);
CREATE FUNCTION entity_history_snapshot(kind text,t text,k text) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE state jsonb;tab text;keycol text;
BEGIN
 IF kind='product' THEN
  SELECT jsonb_build_object('record',to_jsonb(p)-'tenant',
   'translations',coalesce((SELECT jsonb_object_agg(l.locale,jsonb_build_object('name',x.name,'description',x.description)) FROM product_translations x JOIN languages l ON l.id=x.language_id WHERE x.tenant=t AND x.product_id=k),'{}'),
   'categories',coalesce((SELECT jsonb_agg(category_id ORDER BY category_id) FROM product_categories WHERE tenant=t AND product_id=k),'[]'),
   'channels',coalesce((SELECT jsonb_agg(jsonb_build_object('id',channel_id,'visible',visible) ORDER BY channel_id) FROM product_channel_visibility WHERE tenant=t AND product_id=k),'[]')) INTO state FROM products p WHERE p.tenant=t AND p.id=k;
  RETURN state;
 ELSIF kind='customer' THEN
  SELECT jsonb_build_object('id',c.id,'email',c.email,'profile',c.profile,'company',c.company,'customerGroup',c.group_name,'active',c.active,'revision',c.revision,'defaultBillingAddressId',c.default_billing_address_id,'defaultShippingAddressId',c.default_shipping_address_id,
   'addresses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'address',a.data,'revision',a.revision) ORDER BY a.id) FROM customer_addresses a WHERE a.tenant=t AND a.email=k),'[]')) INTO state FROM customers c WHERE c.tenant=t AND c.email=k;
  RETURN state;
 ELSIF kind='order' THEN
  SELECT data #- '{cart,token}' INTO state FROM orders WHERE tenant=t AND id=k;RETURN state;
 END IF;
 SELECT x.tab,x.keycol INTO tab,keycol FROM (VALUES
  ('category','categories','id'),('settings','commerce_settings','tenant'),('checkoutChannel','commerce_overrides','channel_id'),
  ('company','receipt_settings','tenant'),('companyChannel','company_overrides','channel_id'),
  ('rule','commerce_rules','id'),('flow','commerce_flows','id'),('promotion','commerce_promotions','id'),
  ('channel','sales_channels','id'),('source','knowledge_documents','id')) x(kind,tab,keycol) WHERE x.kind=$1;
 IF tab IS NULL THEN RAISE EXCEPTION 'Unknown history entity'; END IF;
 EXECUTE format('SELECT to_jsonb(r)-''tenant'' FROM %I r WHERE tenant=$1 AND %I=$2',tab,keycol) INTO state USING t,CASE WHEN keycol='tenant' THEN t ELSE k END;
 RETURN state;
END $fn$;
CREATE FUNCTION capture_entity_history() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE rowdata jsonb;t text;k text;s jsonb;kind text;
BEGIN
 rowdata:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 t:=rowdata->>'tenant';kind:=TG_ARGV[0];k:=CASE WHEN TG_ARGV[1]='tenant' THEN 'base' ELSE rowdata->>TG_ARGV[1] END;
 IF TG_WHEN='BEFORE' THEN
  s:=entity_history_snapshot(kind,t,k);
  INSERT INTO entity_history(tenant,entity,entity_id,transaction_id,actor,source,reason,before_state)
  VALUES(t,kind,k,txid_current(),nullif(current_setting('vendune.actor',true),''),coalesce(nullif(current_setting('vendune.source',true),''),'system'),nullif(current_setting('vendune.reason',true),''),s)
  ON CONFLICT DO NOTHING;
 ELSE
  s:=entity_history_snapshot(kind,t,k);
  UPDATE entity_history SET after_state=s WHERE tenant=t AND entity=kind AND entity_id=k AND transaction_id=txid_current();
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $fn$;
DO $fn$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('products','product','id'),('product_translations','product','product_id'),('product_categories','product','product_id'),('product_channel_visibility','product','product_id'),
 ('customers','customer','email'),('customer_addresses','customer','email'),('orders','order','id'),
 ('categories','category','id'),('commerce_settings','settings','tenant'),('commerce_overrides','checkoutChannel','channel_id'),
 ('receipt_settings','company','tenant'),('company_overrides','companyChannel','channel_id'),
 ('commerce_rules','rule','id'),('commerce_flows','flow','id'),('commerce_promotions','promotion','id'),('sales_channels','channel','id'),('knowledge_documents','source','id')) x(tab,kind,keycol)
 LOOP
  EXECUTE format('CREATE TRIGGER history_before BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_entity_history(%L,%L)',item.tab,item.kind,item.keycol);
  EXECUTE format('CREATE TRIGGER history_after AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_entity_history(%L,%L)',item.tab,item.kind,item.keycol);
 END LOOP;
END $fn$;
