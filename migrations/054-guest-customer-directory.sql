-- Guest CRM lookup and deterministic latest-contact projection, scoped by tenant.
CREATE INDEX orders_guest_contact ON orders(tenant,(data->'orderCustomer'->>'email'),created_at DESC,id DESC)
WHERE data->'orderCustomer'->>'guest'='true';
