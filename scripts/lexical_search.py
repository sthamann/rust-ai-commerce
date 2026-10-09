#!/usr/bin/env python3
"""Native lexical candidates: real forced-RLS plans, backfill, source edits and isolation."""
import json
import os
from pathlib import Path
import subprocess
import uuid
from testing.database import psql

root = Path(__file__).resolve().parents[1]
role = 'lexical_reader_' + uuid.uuid4().hex[:12]
database = os.environ['TEST_DATABASE']
container = os.environ['TEST_DB_CONTAINER']

def sql(statement, rejected=None):
    result = subprocess.run(psql(container, 'commerce', database, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'), input=statement, text=True, capture_output=True)
    if rejected:
        assert result.returncode and rejected in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr
    return result.stdout.strip()

product_query = (root / 'src/knowledge/search.sql').read_text()
source_query = (root / 'src/documents/search.sql').read_text().strip().rstrip(';')
def scope(tenant):
    return f"SET LOCAL ROLE {role}; SET LOCAL rac.tenant='{tenant}'; SET LOCAL rac.system='off';"
def products(query, tenant='workshop', actor='workshop', explain=False):
    operation = 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' if explain else ''
    out = sql('BEGIN; ' + scope(actor) + 'PREPARE native_product(text,text,jsonb,text) AS ' + product_query + operation + f"EXECUTE native_product('{tenant}','{query}','[]','fixture'); ROLLBACK;")
    return json.loads(out) if explain else [json.loads(line)['id'] for line in out.splitlines() if line]
def sources(query, public=True, actor='workshop', explain=False, vectors=(), digests=(), model='fixture'):
    operation = 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' if explain else ''
    source = 'SELECT coalesce(jsonb_agg(to_jsonb(x)),\'[]\') FROM (' + source_query + ') x;'
    array = lambda xs: 'ARRAY[' + ','.join("'"+x.replace("'","''")+"'" for x in xs) + ']::text[]'
    out = sql('BEGIN; ' + scope(actor) + 'PREPARE native_source(text,text,text,boolean,text[],text[],text,text,text) AS ' + source + operation + f"EXECUTE native_source('workshop','mug','{query}',{str(public).lower()},{array(vectors)},{array(digests)},'{model}','en-GB','en-GB'); ROLLBACK;")
    return json.loads(out)
def nodes(plan):
    return [plan] + [node for child in plan.get('Plans', []) for node in nodes(child)]
def indexed(plan, name, sources):
    all_nodes = nodes(plan[0]['Plan'])
    assert any(n.get('Index Name') == name for n in all_nodes), all_nodes
    scans = [{k:n.get(k) for k in ['Node Type','Relation Name','Index Name','Actual Rows','Rows Removed by Filter']} for n in all_nodes if 'Scan' in n['Node Type']]
    (root / '.run' / (name + '-plan.json')).write_text(json.dumps(plan,indent=2))
    assert not any(n['Node Type'] == 'Seq Scan' and n.get('Actual Loops',0) > 0 and n.get('Relation Name') in sources for n in all_nodes), scans

def projection_exact():
    # Both directions: no forgotten native tokens and no stale/extra projection tokens.
    for table, native, identity, content in [
        ('knowledge_product_lexemes','products','id',"name||' '||description"),
        ('knowledge_chunk_lexemes','knowledge_chunks','document_id,position','text'),
    ]:
        key = 'product_id' if table == 'knowledge_product_lexemes' else 'document_id,position'
        assert sql(f"WITH expected AS (SELECT tenant,{identity},unnest(tsvector_to_array(to_tsvector('simple',{content}))) AS lexeme FROM {native}), delta AS ((SELECT * FROM expected EXCEPT SELECT tenant,{key},lexeme FROM {table}) UNION ALL (SELECT tenant,{key},lexeme FROM {table} EXCEPT SELECT * FROM expected)) SELECT count(*) FROM delta;") == '0'

try:
    sql("INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock) SELECT 'workshop','lexical-fixture-'||g,'Synthetic ordinary item','fixture',CASE WHEN g=123 THEN 'distinctiveneedle red cotton' ELSE 'Ordinary synthetic description' END,24.9,19,100 FROM generate_series(1,5000) g;")
    sql("INSERT INTO knowledge_documents(tenant,id,product_id,title,content_hash,content,visibility,source_type,locale) SELECT 'workshop','lexical-fixture-doc-'||g,'mug','Synthetic sheet','fixture-hash-'||g,'fixture','public','text','en-GB' FROM generate_series(1,5000) g; INSERT INTO knowledge_chunks(tenant,document_id,position,text) SELECT 'workshop','lexical-fixture-doc-'||g,0,CASE WHEN g=123 THEN 'distinctivedocneedle red cotton' ELSE 'Ordinary synthetic source' END FROM generate_series(1,5000) g;")
    # Recreate the pre-079 state, then execute the actual migration on existing sources.
    sql('DROP TRIGGER knowledge_product_words_changed ON products; DROP TRIGGER knowledge_chunk_words_changed ON knowledge_chunks; DROP FUNCTION knowledge_product_words(); DROP FUNCTION knowledge_chunk_words(); DROP TABLE knowledge_product_lexemes,knowledge_chunk_lexemes; DROP INDEX knowledge_serves_target; BEGIN; ' + (root / 'migrations/079-knowledge-lexical-indexes.sql').read_text() + ' COMMIT; ANALYZE products; ANALYZE knowledge_documents; ANALYZE knowledge_chunks; ANALYZE knowledge_product_lexemes; ANALYZE knowledge_chunk_lexemes;')
    projection_exact()
    print('PASS actual migration backfills both word projections exactly from existing sources', flush=True)
    sql(f'CREATE ROLE {role} NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO {role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO {role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO {role};')
    assert products('distinctiveneedle') == ['lexical-fixture-123']
    assert products('red cotton') == ['lexical-fixture-123']
    assert not products('distinctiveneedle missingword')
    assert not products('')
    assert not products('!!!')
    assert products('lexical-fixture-123') == ['lexical-fixture-123']
    assert not products('distinctiveneedle', actor='atelier')
    indexed(products('distinctiveneedle', explain=True),'knowledge_product_lexemes_pkey',{'products'})
    hits = sources('distinctivedocneedle')
    assert len(hits) == 1 and hits[0]['id'] == 'lexical-fixture-doc-123' and hits[0]['position'] == 0, hits
    assert sources('distinctivedocneedle nonexistent') == hits  # Documents intentionally match any query term.
    assert not sources('!!!')
    assert not sources('distinctivedocneedle', actor='atelier')
    indexed(sources('distinctivedocneedle', explain=True),'knowledge_chunk_lexemes_pkey',{'knowledge_chunks','knowledge_documents'})
    sql("UPDATE knowledge_chunks SET embedding_model='fixture' WHERE tenant='workshop' AND document_id='lexical-fixture-doc-123';")
    vector = {'vectors':['lexical-fixture-doc-123:0'],'digests':['fixture-hash-123']}
    assert sources('', **vector) == hits
    assert not sources('', vectors=vector['vectors'],digests=['old-digest'])
    assert not sources('', model='old-model', **vector)
    assert not sources('', actor='atelier', **vector)
    sql("INSERT INTO knowledge_documents(tenant,id,product_id,title,content_hash,content,visibility,source_type,locale) VALUES('workshop','lexical-fixture-doc:colon','mug','Colon ID','colon-hash','fixture','public','text','en-GB'); INSERT INTO knowledge_chunks(tenant,document_id,position,text,embedding_model) VALUES('workshop','lexical-fixture-doc:colon',7,'Native semantic content','fixture');")
    colon = {'vectors':['lexical-fixture-doc:colon:7'],'digests':['colon-hash']}
    assert sources('', **colon)[0]['id']=='lexical-fixture-doc:colon'
    assert not sources('',vectors=['lexical-fixture-doc:colon:999999999999999999999999','malformed'],digests=['colon-hash','colon-hash'])
    sql("UPDATE knowledge_documents SET visibility='private' WHERE tenant='workshop' AND id='lexical-fixture-doc:colon';")
    assert not sources('', **colon) and sources('',public=False, **colon)
    sql("DELETE FROM knowledge_documents WHERE tenant='workshop' AND id='lexical-fixture-doc:colon';")
    print('PASS candidate-fenced semantic hydration preserves colon IDs, model/hash and visibility/RLS checks, and ignores malformed positions without casting overflow',flush=True)
    print('PASS actual native product/document queries use B-tree indexes with NOSUPERUSER NOBYPASSRLS; AND/OR and exact-ID semantics preserved', flush=True)
    for table in ['knowledge_product_lexemes','knowledge_chunk_lexemes']:
        assert sql(f'BEGIN; SET LOCAL ROLE {role}; SELECT count(*) FROM {table}; ROLLBACK;') == '0'
        assert sql('BEGIN; ' + scope('atelier') + f"SELECT count(*) FROM {table} WHERE tenant='workshop'; ROLLBACK;") == '0'
    sql('BEGIN; ' + scope('atelier') + "INSERT INTO knowledge_product_lexemes VALUES('workshop','lexical-fixture-123','forged'); ROLLBACK;", rejected='42501')
    sql('BEGIN; ' + scope('atelier') + "INSERT INTO knowledge_product_lexemes VALUES('atelier','lexical-fixture-123','forged'); ROLLBACK;", rejected='23503')
    sql('BEGIN; ' + scope('atelier') + "INSERT INTO knowledge_chunk_lexemes VALUES('atelier','lexical-fixture-doc-123',0,'forged'); ROLLBACK;", rejected='23503')
    print('PASS absent/foreign RLS contexts and composite native-source foreign keys reject forged projection links', flush=True)
    # Projection matches never replace native content predicates or public source admission.
    sql("INSERT INTO knowledge_product_lexemes VALUES('workshop','lexical-fixture-124','distinctiveneedle'); INSERT INTO knowledge_chunk_lexemes VALUES('workshop','lexical-fixture-doc-124',0,'distinctivedocneedle');")
    assert products('distinctiveneedle') == ['lexical-fixture-123']
    assert len(sources('distinctivedocneedle')) == 1
    sql("DELETE FROM knowledge_product_lexemes WHERE tenant='workshop' AND product_id='lexical-fixture-124' AND lexeme='distinctiveneedle'; DELETE FROM knowledge_chunk_lexemes WHERE tenant='workshop' AND document_id='lexical-fixture-doc-124' AND position=0 AND lexeme='distinctivedocneedle';")
    sql('BEGIN; ' + scope('workshop') + "UPDATE products SET description='changednativeword' WHERE tenant='workshop' AND id='lexical-fixture-123'; UPDATE knowledge_chunks SET text='changedsourceword' WHERE tenant='workshop' AND document_id='lexical-fixture-doc-123' AND position=0; COMMIT;")
    assert not products('distinctiveneedle')
    assert products('changednativeword') == ['lexical-fixture-123']
    assert not sources('distinctivedocneedle')
    assert len(sources('changedsourceword')) == 1
    sql("UPDATE knowledge_documents SET visibility='private' WHERE tenant='workshop' AND id='lexical-fixture-doc-123';")
    assert not sources('changedsourceword')
    assert len(sources('changedsourceword', public=False)) == 1
    sql("UPDATE knowledge_documents SET visibility='public',archived=true WHERE tenant='workshop' AND id='lexical-fixture-doc-123';")
    assert not sources('changedsourceword', public=False)
    projection_exact()
    print('PASS native rechecks suppress forged candidates; scoped edits replace words atomically; private/archive changes withdraw source answers', flush=True)
    sql("DELETE FROM products WHERE tenant='workshop' AND id LIKE 'lexical-fixture-%'; DELETE FROM knowledge_documents WHERE tenant='workshop' AND id LIKE 'lexical-fixture-doc-%';")
    assert sql("SELECT (SELECT count(*) FROM knowledge_product_lexemes WHERE tenant='workshop' AND product_id LIKE 'lexical-fixture-%')+(SELECT count(*) FROM knowledge_chunk_lexemes WHERE tenant='workshop' AND document_id='lexical-fixture-doc-123');") == '0'
    projection_exact()
    print('PASS native source deletion cascades projections without stale candidates', flush=True)
finally:
    # This registry runs only against the verification harness's isolated database.
    sql(f'DROP OWNED BY {role}; DROP ROLE IF EXISTS {role};') if sql(f"SELECT count(*) FROM pg_roles WHERE rolname='{role}'") == '1' else None
