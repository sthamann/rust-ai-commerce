-- Current public/private source hydration and RRF; lexical candidates use the RLS-safe word projection.
WITH terms AS MATERIALIZED (SELECT unnest(tsvector_to_array(to_tsvector('simple',$3))) AS word
), matches AS (SELECT DISTINCT l.document_id,l.position
 FROM terms q JOIN knowledge_chunk_lexemes l ON l.tenant=$1 AND l.lexeme=q.word
), scope AS NOT MATERIALIZED (
 SELECT d.id,COALESCE(d.translations->$8->>'title',d.translations->$9->>'title',d.title) AS title,d.product_id,d.source_type,d.content_hash,d.revision,c.position,c.text,c.locale,c.embedding_model
 FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id
 WHERE d.tenant=$1 AND NOT d.archived AND c.locale IN (CASE WHEN jsonb_typeof(d.translations->$8->'content')='string' THEN $8 WHEN jsonb_typeof(d.translations->$9->'content')='string' THEN $9 ELSE d.locale END,'') AND (NOT $4 OR d.visibility='public') AND ($2::text IS NULL OR d.product_id IS NULL OR d.product_id=$2 OR d.product_id=(SELECT parent_id
 FROM products
 WHERE tenant=$1 AND id=$2))
), lexical AS (
 SELECT s.id,s.position,1.0/(60+row_number() OVER(ORDER BY ts_rank_cd(to_tsvector('simple',text),replace(plainto_tsquery('simple',$3)::text,' & ',' | ')::tsquery) DESC)) AS score
 FROM matches m JOIN scope s ON s.id=m.document_id AND s.position=m.position
 WHERE to_tsvector('simple',text) @@ replace(plainto_tsquery('simple',$3)::text,' & ',' | ')::tsquery
 ORDER BY score DESC LIMIT 8
), semantic AS (
 SELECT s.id,s.position,1.0/(60+v.rank) AS score
 FROM unnest($5::text[],$6::text[]) WITH ORDINALITY AS v(object_id,digest,rank) JOIN scope s ON s.id||':'||s.position=v.object_id AND s.content_hash=v.digest AND s.embedding_model=$7
), ranks AS (
 SELECT id,position,sum(score) AS score
 FROM (SELECT *
 FROM lexical UNION ALL SELECT *
 FROM semantic) v GROUP BY id,position)
SELECT s.id,s.title,s.product_id,s.source_type,s.content_hash,s.revision,s.position,s.text,s.locale
 FROM scope s JOIN ranks r ON r.id=s.id AND r.position=s.position
 ORDER BY r.score DESC,s.id,s.position LIMIT 8;
