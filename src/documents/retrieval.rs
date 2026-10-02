//! Bounded lexical/vector source retrieval; public questions use only explicitly published documents.
use super::*;
pub(crate) async fn search(
    a: &App,
    t: &str,
    product: Option<&str>,
    query: &str,
    public: bool,
) -> Result<Value> {
    let model = env::var("EMBEDDING_MODEL").unwrap_or("qwen3-embedding:0.6b".into());
    let indexed:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE c.tenant=$1 AND c.embedding_model=$2 AND (NOT $3 OR d.visibility='public') AND ($4::text IS NULL OR d.product_id IS NULL OR d.product_id=$4 OR d.product_id=(SELECT parent_id FROM products WHERE tenant=$1 AND id=$4)))").bind(t).bind(&model).bind(public).bind(product).fetch_one(&a.db).await?;
    let vector = if indexed {
        knowledge::embedding(&a.http, &a.ollama, &model, query)
            .await
            .ok()
    } else {
        None
    };
    let literal = vector.map(|v| json!(v).to_string());
    let rows=sqlx::query("WITH scope AS (SELECT d.id,d.title,d.source_type,d.content_hash,c.position,c.text,c.embedding,c.embedding_model FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE d.tenant=$1 AND (NOT $4 OR d.visibility='public') AND ($2::text IS NULL OR d.product_id IS NULL OR d.product_id=$2 OR d.product_id=(SELECT parent_id FROM products WHERE tenant=$1 AND id=$2))), lexical AS (SELECT id,position,1.0/(60+row_number() OVER(ORDER BY ts_rank_cd(to_tsvector('simple',text),plainto_tsquery('simple',$3)) DESC)) AS score FROM scope WHERE to_tsvector('simple',text) @@ plainto_tsquery('simple',$3) LIMIT 8), semantic AS (SELECT id,position,1.0/(60+row_number() OVER(ORDER BY embedding <=> $5::text::vector)) AS score FROM scope WHERE $5::text IS NOT NULL AND embedding IS NOT NULL AND embedding_model=$6 ORDER BY embedding <=> $5::text::vector LIMIT 8), ranks AS (SELECT id,position,sum(score) AS score FROM (SELECT * FROM lexical UNION ALL SELECT * FROM semantic) v GROUP BY id,position) SELECT s.id,s.title,s.source_type,s.content_hash,s.position,s.text FROM scope s JOIN ranks r ON r.id=s.id AND r.position=s.position ORDER BY r.score DESC,s.id,s.position LIMIT 8")
        .bind(t).bind(product).bind(query).bind(public).bind(literal).bind(&model).fetch_all(&a.db).await?;
    Ok(json!(rows.iter().map(|r|json!({"sourceId":format!("{}:{}",r.get::<String,_>("id"),r.get::<i32,_>("position")),"documentId":r.get::<String,_>("id"),"title":r.get::<String,_>("title"),"sourceType":r.get::<String,_>("source_type"),"contentHash":r.get::<String,_>("content_hash"),"text":r.get::<String,_>("text")})).collect::<Vec<_>>()))
}
pub(crate) async fn index(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    let model = env::var("EMBEDDING_MODEL").unwrap_or("qwen3-embedding:0.6b".into());
    let rows=sqlx::query("SELECT position,text FROM knowledge_chunks WHERE tenant=$1 AND document_id=$2 AND embedding_model IS DISTINCT FROM $3 ORDER BY position LIMIT 100").bind(&t).bind(&id).bind(&model).fetch_all(&a.db).await?;
    for r in &rows {
        let vector = knowledge::embedding(&a.http, &a.ollama, &model, &r.get::<String, _>("text"))
            .await
            .map_err(|e| Error(StatusCode::BAD_GATEWAY, e))?;
        sqlx::query("UPDATE knowledge_chunks SET embedding=$1::text::vector,embedding_model=$2 WHERE tenant=$3 AND document_id=$4 AND position=$5").bind(json!(vector).to_string()).bind(&model).bind(&t).bind(&id).bind(r.get::<i32,_>("position")).execute(&a.db).await?;
    }
    Ok(Json(json!({"indexed":rows.len(),"model":model})))
}
