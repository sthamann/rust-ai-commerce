-- Inventory allocations for manual/simulated/provider payments; historic snapshots are backfilled once.
CREATE TABLE order_inventory_reservations (
 tenant text NOT NULL REFERENCES tenants(id), order_id text NOT NULL, product_id text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), released_at timestamptz,
 PRIMARY KEY(tenant,order_id,product_id),
 FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id),
 FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id)
);
INSERT INTO order_inventory_reservations(tenant,order_id,product_id,quantity,released_at)
 SELECT o.tenant,o.id,line->>'referencedId',sum((line->>'quantity')::integer)::integer,
 CASE WHEN o.data->>'state' IN ('cancelled','expired') THEN now() ELSE NULL END
 FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.data#>'{cart,lineItems}') AS line
 JOIN products p ON p.tenant=o.tenant AND p.id=line->>'referencedId'
 WHERE (line->>'quantity')::integer>0 GROUP BY o.tenant,o.id,line->>'referencedId',o.data->>'state';
ALTER TABLE order_inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_inventory_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY core_tenant_scope ON order_inventory_reservations USING(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),'')) WITH CHECK(current_setting('rac.system',true)='on' OR tenant=nullif(current_setting('rac.tenant',true),''));
-- Persist currency scale at the payment ledger boundary; current checkout remains EUR-only.
ALTER TABLE payment_attempts ADD COLUMN currency_scale smallint NOT NULL DEFAULT 2 CHECK(currency_scale=2);
