-- Remove only unreferenced delivered metadata after its separate audit window.
WITH expired AS (
 SELECT e.id FROM outbox e
 WHERE e.delivered_at < now()-$1*interval '1 day' AND e.payload_retired_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM projections p WHERE p.event_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM app_deliveries d WHERE d.event_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM flow_jobs f WHERE f.event_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM knowledge_receipts r WHERE r.event_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM observed_pairs p WHERE p.last_event=e.id)
 AND NOT EXISTS(SELECT 1 FROM pair_evidence p WHERE p.event_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM app_schedule_runs s WHERE s.event_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM app_webhook_receipts w WHERE w.event_id=e.id)
 ORDER BY e.delivered_at,e.id LIMIT 1000 FOR UPDATE OF e SKIP LOCKED
)
DELETE FROM outbox WHERE id IN(SELECT id FROM expired);
