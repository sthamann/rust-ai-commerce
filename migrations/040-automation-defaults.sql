-- One-time, non-destructive backfill and shared provisioning. Serving never recreates deleted templates.
CREATE FUNCTION public.seed_shop_automation(shop text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
 settings jsonb; owner_id text; languages jsonb; main_language text;
 names jsonb; condition jsonb; flow jsonb;
BEGIN
 SELECT data INTO settings FROM commerce_settings WHERE tenant=shop;
 IF settings IS NULL THEN RETURN; END IF;
 languages := coalesce(settings->'locales','["en-GB","de-DE","fr-FR","es-ES"]'::jsonb); main_language := coalesce(settings->>'mainLocale','en-GB');
 SELECT user_id INTO owner_id FROM memberships WHERE tenant=shop AND role='owner' AND active ORDER BY user_id LIMIT 1;
 owner_id := coalesce(owner_id,'bootstrap');
 names := '{"en-GB":"Main storefront","de-DE":"Haupt-Verkaufskanal","es-ES":"Tienda principal","fr-FR":"Boutique principale"}';
 IF NOT names ? main_language THEN names := names || jsonb_build_object(main_language,'Main storefront'); END IF;
 INSERT INTO sales_channels(tenant,id,data) VALUES(shop,'default',jsonb_build_object('name',names,'kind','storefront','active',true,'locales',languages,'productIds','[]'::jsonb,'navigationCategoryId',NULL)) ON CONFLICT DO NOTHING;
 FOR names,condition IN SELECT * FROM (VALUES
 ('{"en-GB":"All orders","de-DE":"Alle Bestellungen","es-ES":"Todos los pedidos","fr-FR":"Toutes les commandes"}'::jsonb,'{"type":"alwaysValid"}'::jsonb),
 ('{"en-GB":"Business customers","de-DE":"Geschäftskunden","es-ES":"Clientes empresariales","fr-FR":"Clients professionnels"}'::jsonb,'{"type":"customerGroup","operator":"=","values":["business"]}'::jsonb),
 ('{"en-GB":"Cart from 100","de-DE":"Warenkorb ab 100","es-ES":"Carrito desde 100","fr-FR":"Panier à partir de 100"}'::jsonb,'{"type":"cartCartAmount","operator":">=","amount":100}'::jsonb)
 ) AS templates(n,c) LOOP
  IF NOT names ? main_language THEN names := names || jsonb_build_object(main_language,names->>'en-GB'); END IF;
  INSERT INTO commerce_rules(tenant,id,name,condition) VALUES(shop,
   CASE condition->>'type' WHEN 'alwaysValid' THEN 'default_all_orders' WHEN 'customerGroup' THEN 'default_business_customers' ELSE 'default_cart_100' END,names,condition) ON CONFLICT DO NOTHING;
 END LOOP;
 FOR flow IN SELECT value FROM jsonb_array_elements('[
 {"id":"default_order_received","event":"order.placed","name":{"en-GB":"Order received","de-DE":"Bestellung eingegangen","es-ES":"Pedido recibido","fr-FR":"Commande reçue"},"instruction":{"en-GB":"Order received. Check fulfillment and payment before dispatch.","de-DE":"Bestellung eingegangen. Lieferung und Zahlung vor dem Versand prüfen.","es-ES":"Pedido recibido. Revisa la entrega y el pago antes del envío.","fr-FR":"Commande reçue. Vérifiez la livraison et le paiement avant expédition."}},
 {"id":"default_payment_received","event":"payment.captured","name":{"en-GB":"Payment received","de-DE":"Zahlung eingegangen","es-ES":"Pago recibido","fr-FR":"Paiement reçu"},"instruction":{"en-GB":"Payment capture confirmed by the payment event.","de-DE":"Zahlungseingang durch das Zahlungsereignis bestätigt.","es-ES":"Cobro confirmado por el evento de pago.","fr-FR":"Encaissement confirmé par l’événement de paiement."}}
 ]'::jsonb) LOOP
  IF NOT (flow->'name') ? main_language THEN
   flow := jsonb_set(flow,'{name}',flow->'name' || jsonb_build_object(main_language,flow->'name'->>'en-GB'));
   flow := jsonb_set(flow,'{instruction}',flow->'instruction' || jsonb_build_object(main_language,flow->'instruction'->>'en-GB'));
  END IF;
  INSERT INTO commerce_flows(tenant,id,data) VALUES(shop,flow->>'id',(flow-'id') || jsonb_build_object('active',true,'condition',jsonb_build_object('type','ruleReference','ruleId','default_all_orders'),'action','note','locale',main_language,'actor',owner_id)) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
SELECT public.seed_shop_automation(tenant) FROM commerce_settings;
-- Channel deletion cannot race a checkout/customer write into a dangling channel.
ALTER TABLE carts ADD COLUMN sales_channel_id text GENERATED ALWAYS AS (coalesce(data->>'sales_channel','default')) STORED;
ALTER TABLE carts ADD CONSTRAINT carts_sales_channel_tenant_fk FOREIGN KEY(tenant,sales_channel_id) REFERENCES sales_channels(tenant,id);
ALTER TABLE customers ADD CONSTRAINT customers_sales_channel_tenant_fk FOREIGN KEY(tenant,sales_channel_id) REFERENCES sales_channels(tenant,id);
CREATE INDEX carts_sales_channel_lookup ON carts(tenant,sales_channel_id);
CREATE INDEX customers_sales_channel_lookup ON customers(tenant,sales_channel_id);
