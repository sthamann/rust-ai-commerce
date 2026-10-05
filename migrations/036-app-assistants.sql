-- Persistent schedules and authenticated webhook receipts; packages own lifecycle, outbox owns dispatch.
CREATE TABLE app_schedules(tenant text NOT NULL,app text NOT NULL,id text NOT NULL,definition jsonb NOT NULL,next_run timestamptz NOT NULL,PRIMARY KEY(tenant,app,id),FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id));
CREATE INDEX app_schedules_due ON app_schedules(next_run);
CREATE TABLE app_schedule_runs(tenant text NOT NULL,app text NOT NULL,schedule text NOT NULL,due timestamptz NOT NULL,event_id bigint NOT NULL REFERENCES outbox(id),PRIMARY KEY(tenant,app,schedule,due));
CREATE TABLE app_webhook_receipts(tenant text NOT NULL,app text NOT NULL,webhook text NOT NULL,request_key text NOT NULL,digest text NOT NULL,event_id bigint NOT NULL REFERENCES outbox(id),PRIMARY KEY(tenant,app,webhook,request_key));
