-- Append-only extension of the former EUR-only ledger; existing EUR attempts keep scale 2.
ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_currency_check;
ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_currency_scale_check;
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_currency_check CHECK(currency ~ '^[A-Z]{3}$');
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_currency_scale_check CHECK(currency_scale = CASE
 WHEN currency IN ('JPY','KRW','CLP') THEN 0
 WHEN currency IN ('BHD','KWD','OMR','JOD','TND') THEN 3
 ELSE 2 END);
