-- Private provider evidence and an incremental app-export cursor; no customer storefront access.
CREATE TABLE app_evidence (
 tenant text NOT NULL REFERENCES tenants(id),app text NOT NULL,source_id text NOT NULL,
 kind text NOT NULL,title text NOT NULL,body text NOT NULL,source_url text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',digest text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,app,source_id),FOREIGN KEY(tenant,app) REFERENCES app_packages(tenant,id)
);
CREATE INDEX app_evidence_search ON app_evidence USING gin(to_tsvector('simple',title||' '||body));
CREATE TABLE app_export_cursors(tenant text NOT NULL,app text NOT NULL,cursor bigint NOT NULL DEFAULT 0,PRIMARY KEY(tenant,app));
