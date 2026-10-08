-- The existing relation ledger gains typed nodes and time/version evidence, not a second graph database.
CREATE TABLE knowledge_nodes(
 tenant text NOT NULL REFERENCES tenants(id),kind text NOT NULL,id text NOT NULL,data jsonb NOT NULL DEFAULT '{}',
 revision bigint NOT NULL DEFAULT 1,PRIMARY KEY(tenant,kind,id),CHECK(length(kind)<=80 AND length(id)<=240)
);
ALTER TABLE knowledge_relations ADD COLUMN source_kind text NOT NULL DEFAULT 'product',ADD COLUMN target_kind text NOT NULL DEFAULT 'intent',
 ADD COLUMN state text NOT NULL DEFAULT 'evidenced' CHECK(state IN ('proposed','evidenced','confirmed','rejected')),
 ADD COLUMN revision bigint NOT NULL DEFAULT 1,ADD COLUMN confidence numeric NOT NULL DEFAULT 1 CHECK(confidence>=0 AND confidence<=1),
 ADD COLUMN valid_from timestamptz NOT NULL DEFAULT now(),ADD COLUMN valid_until timestamptz,
 ADD COLUMN recorded_from timestamptz NOT NULL DEFAULT now(),ADD COLUMN actor text NOT NULL DEFAULT 'system';
CREATE TABLE knowledge_relation_history(
 tenant text NOT NULL REFERENCES tenants(id),kind text NOT NULL,source_id text NOT NULL,target_id text NOT NULL,
 revision bigint NOT NULL,snapshot jsonb NOT NULL,recorded_from timestamptz NOT NULL,recorded_until timestamptz NOT NULL,
 PRIMARY KEY(tenant,kind,source_id,target_id,revision)
);
CREATE FUNCTION cognitive_relation_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN
  INSERT INTO knowledge_relation_history VALUES(OLD.tenant,OLD.kind,OLD.source_id,OLD.target_id,OLD.revision,to_jsonb(OLD),OLD.recorded_from,clock_timestamp()) ON CONFLICT DO NOTHING;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN NEW.revision=OLD.revision+1;NEW.recorded_from=clock_timestamp(); END IF;
 IF NEW.kind IN ('PAIRS_WITH','CO_PURCHASED') THEN NEW.target_kind='product';
 ELSIF NEW.kind='HAS_DOCUMENT' THEN NEW.target_kind='document';
 ELSIF NEW.kind='REFERENCES_PRODUCT' THEN NEW.source_kind='support';NEW.target_kind='product';
 END IF;
 IF NEW.kind IN ('SERVES','PAIRS_WITH') THEN NEW.state='confirmed'; END IF;
 INSERT INTO knowledge_nodes(tenant,kind,id) VALUES(NEW.tenant,NEW.source_kind,NEW.source_id),(NEW.tenant,NEW.target_kind,NEW.target_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER cognitive_relation_write BEFORE INSERT OR UPDATE OR DELETE ON knowledge_relations FOR EACH ROW EXECUTE FUNCTION cognitive_relation_write();
UPDATE knowledge_relations SET data=data;
ALTER TABLE knowledge_relations ADD CONSTRAINT knowledge_relations_source_node FOREIGN KEY(tenant,source_kind,source_id) REFERENCES knowledge_nodes(tenant,kind,id),
 ADD CONSTRAINT knowledge_relations_target_node FOREIGN KEY(tenant,target_kind,target_id) REFERENCES knowledge_nodes(tenant,kind,id),
 ADD CONSTRAINT knowledge_relations_valid_time CHECK(valid_until IS NULL OR valid_until>valid_from);
DO $$ DECLARE name text; BEGIN FOREACH name IN ARRAY ARRAY['knowledge_nodes','knowledge_relation_history'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',name);
 EXECUTE format('CREATE POLICY core_tenant_scope ON %I USING(current_setting(''rac.system'',true)=''on'' OR tenant=nullif(current_setting(''rac.tenant'',true),'''')) WITH CHECK(current_setting(''rac.system'',true)=''on'' OR tenant=nullif(current_setting(''rac.tenant'',true),''''))',name);
END LOOP; END $$;
CREATE INDEX knowledge_claim_lookup ON knowledge_relations(tenant,source_id,state) WHERE kind='CLAIMS';
