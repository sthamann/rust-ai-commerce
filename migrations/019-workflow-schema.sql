-- Upgrade the initial workflow prototype regardless of the connection's default schema.
SET search_path=public;
DO $$ BEGIN
 IF to_regclass('public.order_state_machines') IS NULL AND to_regclass('commerce.order_state_machines') IS NOT NULL THEN
  ALTER TABLE commerce.order_state_machines SET SCHEMA public;
 END IF;
 IF to_regclass('public.order_transition_requests') IS NULL AND to_regclass('commerce.order_transition_requests') IS NOT NULL THEN
  ALTER TABLE commerce.order_transition_requests SET SCHEMA public;
 END IF;
END $$;
