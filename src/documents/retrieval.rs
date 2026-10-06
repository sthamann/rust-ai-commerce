//! Bounded lexical/vector source retrieval; public questions use only explicitly published documents.
use super::*;
pub(crate) async fn search_in(
    a: &App,
    t: &str,
    product: Option<&str>,
    query: &str,
    public: bool,
    locale: &str,
    semantic: bool,
) -> Result<Value> {
    let (settings, _) = commerce::config(a, t).await?;
    let (endpoint, key, _) = a.inference.connection("ollama").await.unwrap_or_default();
    let model = env::var("EMBEDDING_MODEL").unwrap_or("qwen3-embedding:0.6b".into());
    let indexed:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE c.tenant=$1 AND NOT d.archived AND c.embedding_model=$2 AND (NOT $3 OR d.visibility='public') AND ($4::text IS NULL OR d.product_id IS NULL OR d.product_id=$4 OR d.product_id=(SELECT parent_id FROM products WHERE tenant=$1 AND id=$4)))").bind(t).bind(&model).bind(public).bind(product).fetch_one(&a.db).await?;
    let vector = if indexed && semantic {
        knowledge::embedding(&a.http, &endpoint, key.as_deref(), &model, query)
            .await
            .ok()
    } else {
        None
    };
    let semantic = if let Some(vector) = vector {
        knowledge::vectors::query("document", t, &model, vector)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let ids = semantic
        .iter()
        .filter(|v| v["payload"]["tenant"] == t && v["payload"]["model"] == model)
        .filter_map(|v| v["payload"]["object_id"].as_str().map(str::to_string))
        .collect::<Vec<_>>();
    let digests = semantic
        .iter()
        .filter(|v| v["payload"]["tenant"] == t && v["payload"]["model"] == model)
        .map(|v| {
            v["payload"]["digest"]
                .as_str()
                .unwrap_or_default()
                .to_string()
        })
        .collect::<Vec<_>>();
    let rows=sqlx::query("WITH scope AS (SELECT d.id,COALESCE(d.translations->$8->>'title',d.translations->$9->>'title',d.title) AS title,d.source_type,d.content_hash,c.position,c.text,c.locale,c.embedding_model FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE d.tenant=$1 AND NOT d.archived AND c.locale IN (CASE WHEN jsonb_typeof(d.translations->$8->'content')='string' THEN $8 WHEN jsonb_typeof(d.translations->$9->'content')='string' THEN $9 ELSE d.locale END,'') AND (NOT $4 OR d.visibility='public') AND ($2::text IS NULL OR d.product_id IS NULL OR d.product_id=$2 OR d.product_id=(SELECT parent_id FROM products WHERE tenant=$1 AND id=$2))), lexical AS (SELECT id,position,1.0/(60+row_number() OVER(ORDER BY ts_rank_cd(to_tsvector('simple',text),replace(plainto_tsquery('simple',$3)::text,' & ',' | ')::tsquery) DESC)) AS score FROM scope WHERE to_tsvector('simple',text) @@ replace(plainto_tsquery('simple',$3)::text,' & ',' | ')::tsquery ORDER BY score DESC LIMIT 8), semantic AS (SELECT s.id,s.position,1.0/(60+v.rank) AS score FROM unnest($5::text[],$6::text[]) WITH ORDINALITY AS v(object_id,digest,rank) JOIN scope s ON s.id||':'||s.position=v.object_id AND s.content_hash=v.digest AND s.embedding_model=$7), ranks AS (SELECT id,position,sum(score) AS score FROM (SELECT * FROM lexical UNION ALL SELECT * FROM semantic) v GROUP BY id,position) SELECT s.id,s.title,s.source_type,s.content_hash,s.position,s.text,s.locale FROM scope s JOIN ranks r ON r.id=s.id AND r.position=s.position ORDER BY r.score DESC,s.id,s.position LIMIT 8")
        .bind(t).bind(product).bind(query).bind(public).bind(ids).bind(digests).bind(&model).bind(locale).bind(&settings.main_locale).fetch_all(&a.db).await?;
    Ok(json!(rows.iter().map(|r|json!({"sourceId":format!("{}:{}",r.get::<String,_>("id"),r.get::<i32,_>("position")),"documentId":r.get::<String,_>("id"),"title":r.get::<String,_>("title"),"locale":r.get::<String,_>("locale"),"sourceType":r.get::<String,_>("source_type"),"contentHash":r.get::<String,_>("content_hash"),"text":r.get::<String,_>("text")})).collect::<Vec<_>>()))
}
pub(crate) async fn index(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    let (endpoint, key, _) = a.inference.connection("ollama").await.map_err(bad)?;
    let model = env::var("EMBEDDING_MODEL").unwrap_or("qwen3-embedding:0.6b".into());
    let rows=sqlx::query("SELECT position,text FROM knowledge_chunks WHERE tenant=$1 AND document_id=$2 AND embedding_model IS DISTINCT FROM $3 ORDER BY position LIMIT 100").bind(&t).bind(&id).bind(&model).fetch_all(&a.db).await?;
    for r in &rows {
        let vector = knowledge::embedding(
            &a.http,
            &endpoint,
            key.as_deref(),
            &model,
            &r.get::<String, _>("text"),
        )
        .await
        .map_err(|e| Error(StatusCode::BAD_GATEWAY, e))?;
        sqlx::query("UPDATE knowledge_chunks SET embedding=$1,embedding_model=$2 WHERE tenant=$3 AND document_id=$4 AND position=$5 AND text=$6").bind(vector).bind(&model).bind(&t).bind(&id).bind(r.get::<i32,_>("position")).bind(r.get::<String,_>("text")).execute(&a.db).await?;
    }
    let _ = knowledge::vectors::drain(&a.db).await;
    Ok(Json(json!({"indexed":rows.len(),"model":model})))
}
