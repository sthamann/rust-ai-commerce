-- Current public/private source hydration and RRF; lexical candidates use the RLS-safe word projection.
WITH terms AS MATERIALIZED (SELECT unnest(tsvector_to_array(to_tsvector('simple',$3))) AS word
), matches AS MATERIALIZED (SELECT DISTINCT l.document_id,l.position
 FROM terms q JOIN knowledge_chunk_lexemes l ON l.tenant=$1 AND l.lexeme=q.word
), semantic_keys AS MATERIALIZED (
 SELECT split[1] AS document_id,split[2] AS position,digest,rank
 FROM unnest($5::text[],$6::text[]) WITH ORDINALITY AS v(object_id,digest,rank)
 CROSS JOIN LATERAL regexp_match(v.object_id,'^(.*):([0-9]+)$') AS split
), candidates AS (
 SELECT document_id,position::text FROM matches
 UNION SELECT document_id,position FROM semantic_keys
), scope AS MATERIALIZED (
 SELECT d.id,COALESCE(d.translations->$8->>'title',d.translations->$9->>'title',d.title) AS title,d.product_id,d.source_type,d.content_hash,d.revision,c.position,c.text,c.locale,c.embedding_model
 FROM candidates k
 CROSS JOIN LATERAL (SELECT * FROM knowledge_documents WHERE tenant=$1 AND id=k.document_id OFFSET 0) d
 CROSS JOIN LATERAL (SELECT * FROM knowledge_chunks WHERE tenant=$1 AND document_id=k.document_id AND position::text=k.position OFFSET 0) c
 WHERE NOT d.archived AND c.locale IN (CASE WHEN jsonb_typeof(d.translations->$8->'content')='string' THEN $8 WHEN jsonb_typeof(d.translations->$9->'content')='string' THEN $9 ELSE d.locale END,'') AND (NOT $4 OR d.visibility='public') AND ($2::text IS NULL OR d.product_id IS NULL OR d.product_id=$2 OR d.product_id=(SELECT parent_id FROM products WHERE tenant=$1 AND id=$2))
), lexical AS (
 SELECT s.id,s.position,1.0/(60+row_number() OVER(ORDER BY ts_rank_cd(to_tsvector('simple',text),replace(plainto_tsquery('simple',$3)::text,' & ',' | ')::tsquery) DESC)) AS score
 FROM matches m JOIN scope s ON s.id=m.document_id AND s.position=m.position
 WHERE to_tsvector('simple',text) @@ replace(plainto_tsquery('simple',$3)::text,' & ',' | ')::tsquery
 ORDER BY score DESC LIMIT 8
), semantic AS (
 SELECT s.id,s.position,1.0/(60+v.rank) AS score
 FROM semantic_keys v JOIN scope s ON s.id=v.document_id AND s.position::text=v.position AND s.content_hash=v.digest AND s.embedding_model=$7
), ranks AS (
 SELECT id,position,sum(score) AS score
 FROM (SELECT * FROM lexical UNION ALL SELECT * FROM semantic) v GROUP BY id,position)
SELECT s.id,s.title,s.product_id,s.source_type,s.content_hash,s.revision,s.position,s.text,s.locale
 FROM scope s JOIN ranks r ON r.id=s.id AND r.position=s.position
 ORDER BY r.score DESC,s.id,s.position LIMIT 8;
