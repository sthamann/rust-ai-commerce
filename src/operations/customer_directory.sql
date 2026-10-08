-- One tenant-scoped CRM entry per email, including historical guest checkouts.
WITH contacts AS (
  (SELECT email, jsonb_build_object(
    'id',id,'customerNumber',customer_number,'email',email,'profile',profile,
    'company',company,'customerGroup',group_name,'active',active,'revision',revision,
    'defaultBillingAddressId',default_billing_address_id,
    'defaultShippingAddressId',default_shipping_address_id,
    'createdAt',created_at::text,'guest',false) AS contact
  FROM customers WHERE tenant=$1 AND email>$2
    AND ($3='' OR strpos(lower(email||' '||coalesce(profile->>'name','')),lower($3))>0)
  ORDER BY email LIMIT $4)
  UNION ALL
  (SELECT email,contact FROM (SELECT DISTINCT ON (data->'orderCustomer'->>'email')
    data->'orderCustomer'->>'email' AS email,
    jsonb_build_object('id',null,'customerNumber',null,
      'email',data->'orderCustomer'->>'email',
      'profile',(CASE WHEN jsonb_typeof(data->'billingAddress')='object' THEN data->'billingAddress' ELSE '{}'::jsonb END)||data->'orderCustomer',
      'company',data->'billingAddress'->>'company',
      'customerGroup',coalesce(data->>'customerGroup','consumer'),
      'active',false,'revision',null,'guest',true,'createdAt',created_at::text,
      'billingAddress',data->'billingAddress','shippingAddress',data->'shippingAddress') AS contact
  FROM orders o WHERE tenant=$1 AND data->'orderCustomer'->>'guest'='true'
    AND data->'orderCustomer'->>'email'>$2
    AND NOT EXISTS(SELECT 1 FROM customers c WHERE c.tenant=o.tenant AND c.email=o.data->'orderCustomer'->>'email')
  ORDER BY email,created_at DESC,id DESC) latest
  WHERE $3='' OR strpos(lower(email||' '||coalesce(contact->'profile'->>'name','')),lower($3))>0
  ORDER BY email LIMIT $4)
)
SELECT contact FROM contacts
ORDER BY email LIMIT $4;
