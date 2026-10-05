-- Merchant-requested image jobs never mutate products or retry uncertain paid requests automatically.
CREATE TABLE media_jobs (
 tenant text NOT NULL,id text NOT NULL,product_id text NOT NULL,
 product_revision bigint NOT NULL,request jsonb NOT NULL,state text NOT NULL DEFAULT 'queued',
 asset_id text,error text,started_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id),FOREIGN KEY(tenant,product_id) REFERENCES products(tenant,id),
 CHECK(state IN ('queued','processing','ready','failed','applied'))
);
CREATE INDEX media_jobs_queue ON media_jobs(created_at) WHERE state='queued';
