-- Only the explicit buyer@example.test synthetic template gets example data.
-- Real accounts retain their own existing profile/address records.
SET search_path=public;
INSERT INTO customer_addresses(tenant,email,id,data)
SELECT tenant,email,md5(tenant||':synthetic-demo-address'),'{"name":"Alex Example","firstName":"Alex","lastName":"Example","company":"Example Studio","street":"Demo Street 1","postalCode":"10115","city":"Example City","country":"DE"}'::jsonb
FROM customers WHERE email='buyer@example.test' AND profile='{}'::jsonb AND default_billing_address_id IS NULL;
UPDATE customers c SET profile='{"name":"Alex Example","firstName":"Alex","lastName":"Example","company":"Example Studio"}'::jsonb,default_billing_address_id=a.id,default_shipping_address_id=a.id
FROM customer_addresses a WHERE a.tenant=c.tenant AND a.email=c.email AND a.id=md5(c.tenant||':synthetic-demo-address') AND c.profile='{}'::jsonb;
