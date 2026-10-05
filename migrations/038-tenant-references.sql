-- Scope critical object relationships by tenant as well as globally unique IDs.
-- These constraints prevent wrong-shop associations; they do not replace read authorization/RLS.
-- Validate existing rows atomically. Corruption aborts migration; never silently move or delete it.
ALTER TABLE carts ADD CONSTRAINT carts_tenant_id_key UNIQUE(tenant,id);
ALTER TABLE orders ADD CONSTRAINT orders_tenant_id_key UNIQUE(tenant,id);
ALTER TABLE outbox ADD CONSTRAINT outbox_tenant_id_key UNIQUE(tenant,id);
ALTER TABLE shop_environments ADD CONSTRAINT environments_live_tenant_key UNIQUE(live_tenant,tenant);
ALTER TABLE payment_jobs ADD CONSTRAINT payment_jobs_tenant_id_attempt_key UNIQUE(tenant,id,attempt_id);

ALTER TABLE orders ADD CONSTRAINT orders_cart_scope
 FOREIGN KEY(tenant,cart_id) REFERENCES carts(tenant,id);
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_order_scope
 FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id);
ALTER TABLE inventory_reservations ADD CONSTRAINT reservations_attempt_scope
 FOREIGN KEY(tenant,attempt_id) REFERENCES payment_attempts(tenant,id);
ALTER TABLE payment_jobs ADD CONSTRAINT payment_jobs_attempt_scope
 FOREIGN KEY(tenant,attempt_id) REFERENCES payment_attempts(tenant,id);
ALTER TABLE payment_refunds ADD CONSTRAINT refunds_job_attempt_scope
 FOREIGN KEY(tenant,job_id,attempt_id) REFERENCES payment_jobs(tenant,id,attempt_id);
ALTER TABLE order_activity ADD CONSTRAINT order_activity_order_scope
 FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id);
ALTER TABLE order_receipts ADD CONSTRAINT receipts_order_scope
 FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id);
ALTER TABLE order_downloads ADD CONSTRAINT downloads_order_scope
 FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id);
ALTER TABLE promotion_uses ADD CONSTRAINT promotion_uses_order_scope
 FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id);
ALTER TABLE order_transition_requests ADD CONSTRAINT transition_order_scope
 FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id);
ALTER TABLE checkout_handoffs ADD CONSTRAINT handoffs_cart_scope
 FOREIGN KEY(tenant,cart_id) REFERENCES carts(tenant,id);
ALTER TABLE products ADD CONSTRAINT products_parent_scope
 FOREIGN KEY(tenant,parent_id) REFERENCES products(tenant,id);

ALTER TABLE projections ADD CONSTRAINT projections_event_scope
 FOREIGN KEY(tenant,event_id) REFERENCES outbox(tenant,id);
ALTER TABLE app_deliveries ADD CONSTRAINT app_deliveries_event_scope
 FOREIGN KEY(tenant,event_id) REFERENCES outbox(tenant,id);
ALTER TABLE knowledge_receipts ADD CONSTRAINT knowledge_receipts_event_scope
 FOREIGN KEY(tenant,event_id) REFERENCES outbox(tenant,id);
ALTER TABLE observed_pairs ADD CONSTRAINT observed_pairs_event_scope
 FOREIGN KEY(tenant,last_event) REFERENCES outbox(tenant,id);
ALTER TABLE pair_evidence ADD CONSTRAINT pair_evidence_event_scope
 FOREIGN KEY(tenant,event_id) REFERENCES outbox(tenant,id);
ALTER TABLE flow_jobs ADD CONSTRAINT flow_jobs_event_scope
 FOREIGN KEY(tenant,event_id) REFERENCES outbox(tenant,id);
ALTER TABLE app_schedule_runs ADD CONSTRAINT schedule_runs_event_scope
 FOREIGN KEY(tenant,event_id) REFERENCES outbox(tenant,id);
ALTER TABLE app_webhook_receipts ADD CONSTRAINT webhook_receipts_event_scope
 FOREIGN KEY(tenant,event_id) REFERENCES outbox(tenant,id);

ALTER TABLE shop_releases ADD CONSTRAINT releases_environment_scope
 FOREIGN KEY(live_tenant,environment) REFERENCES shop_environments(live_tenant,tenant);
ALTER TABLE developer_builds ADD CONSTRAINT builds_environment_scope
 FOREIGN KEY(tenant,environment) REFERENCES shop_environments(live_tenant,tenant);
