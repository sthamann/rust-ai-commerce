-- Finalize one aggregate snapshot per committed transaction, avoiding repeated translation/channel scans.
SET search_path=public;
ALTER TABLE entity_history ADD COLUMN finalized boolean NOT NULL DEFAULT false;
UPDATE entity_history SET finalized=true;
ALTER FUNCTION entity_history_snapshot(text,text,text) RENAME TO entity_history_snapshot_v034;
CREATE FUNCTION entity_history_snapshot(kind text,t text,k text) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE state jsonb;metadata jsonb;
BEGIN
 state:=entity_history_snapshot_v034(kind,t,k);
 IF kind='customer' AND state IS NOT NULL THEN
  SELECT jsonb_build_object('customerNumber',customer_number,'salesChannelId',sales_channel_id,'languageId',language_id,'firstLogin',first_login,'lastLogin',last_login,'lastPaymentMethodId',last_payment_method_id,'automation',automation) INTO metadata FROM customers WHERE tenant=t AND email=k;
  state:=state||metadata;
 END IF;
 RETURN state;
END $fn$;
CREATE OR REPLACE FUNCTION capture_entity_history() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE rowdata jsonb;t text;k text;s jsonb;kind text;
BEGIN
 rowdata:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 t:=rowdata->>'tenant';kind:=TG_ARGV[0];k:=CASE WHEN TG_ARGV[1]='tenant' THEN 'base' ELSE rowdata->>TG_ARGV[1] END;
 IF TG_WHEN='BEFORE' THEN
  IF NOT EXISTS(SELECT 1 FROM entity_history WHERE tenant=t AND entity=kind AND entity_id=k AND transaction_id=txid_current()) THEN
   s:=entity_history_snapshot(kind,t,k);
   INSERT INTO entity_history(tenant,entity,entity_id,transaction_id,actor,source,reason,before_state)
   VALUES(t,kind,k,txid_current(),nullif(current_setting('vendune.actor',true),''),coalesce(nullif(current_setting('vendune.source',true),''),'system'),nullif(current_setting('vendune.reason',true),''),s);
  END IF;
 ELSIF EXISTS(SELECT 1 FROM entity_history WHERE tenant=t AND entity=kind AND entity_id=k AND transaction_id=txid_current() AND NOT finalized) THEN
  s:=entity_history_snapshot(kind,t,k);
  UPDATE entity_history SET after_state=s,finalized=true WHERE tenant=t AND entity=kind AND entity_id=k AND transaction_id=txid_current();
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
  EXECUTE format('DROP TRIGGER history_after ON %I',item.tab);
  EXECUTE format('CREATE CONSTRAINT TRIGGER history_after AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION capture_entity_history(%L,%L)',item.tab,item.kind,item.keycol);
 END LOOP;
END $fn$;
