-- Tenant company identity and explicit field overrides; immutable bounded logo bytes.
CREATE TABLE company_overrides (
 tenant text NOT NULL, channel_id text NOT NULL, data jsonb NOT NULL DEFAULT '{}',
 revision bigint NOT NULL DEFAULT 1, PRIMARY KEY(tenant,channel_id),
 FOREIGN KEY(tenant,channel_id) REFERENCES sales_channels(tenant,id),
 CHECK(jsonb_typeof(data)='object')
);
CREATE TABLE company_logos (
 tenant text NOT NULL REFERENCES tenants(id), id text NOT NULL, content bytea NOT NULL,
 digest text NOT NULL, mime text NOT NULL CHECK(mime='image/png'),
 width integer NOT NULL, height integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id), UNIQUE(tenant,digest),
 CHECK(octet_length(content) BETWEEN 1 AND 2097152),
 CHECK(width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096)
);
