SELECT x.arm,x.baseline,coalesce(p.net_minor,0)::bigint AS net_minor,coalesce(p.invalid_currency,false) AS invalid_currency
FROM intelligence_assignments x
JOIN intelligence_experiments e ON e.tenant=x.tenant AND e.id=x.experiment_id
LEFT JOIN LATERAL (
 SELECT coalesce(sum(greatest(p.amount_minor-p.refunded_minor,0)) FILTER(WHERE p.currency=$3),0)::bigint AS net_minor,
 coalesce(bool_or(p.currency<>$3),false) AS invalid_currency
 FROM orders o JOIN payment_attempts p ON p.tenant=o.tenant AND p.order_id=o.id
 WHERE o.tenant=x.tenant AND o.cart_id=x.cart_id AND o.created_at>=x.created_at
 AND o.created_at<=e.ends_at+((e.data->>'settlementDays')::integer*interval '1 day')
 AND p.capture_confirmed_at>=x.created_at AND p.capture_confirmed_at<=e.ends_at+((e.data->>'settlementDays')::integer*interval '1 day')
 AND p.environment='live' AND p.state IN ('captured','captured_late','refunded') AND p.capture_id IS NOT NULL
) p ON true
WHERE x.tenant=$1 AND x.experiment_id=$2 ORDER BY x.cart_id LIMIT 10000
