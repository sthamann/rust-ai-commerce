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
    let model = env::var("EMBEDDING_MODEL").unwrap_or("qwen3-embedding:0.6b".into());
    let indexed:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE c.tenant=$1 AND NOT d.archived AND c.embedding_model=$2 AND (NOT $3 OR d.visibility='public') AND ($4::text IS NULL OR d.product_id IS NULL OR d.product_id=$4 OR d.product_id=(SELECT parent_id FROM products WHERE tenant=$1 AND id=$4)))").bind(t).bind(&model).bind(public).bind(product).fetch_one(&a.db).await?;
    let vector = if indexed && semantic {
        cognition::indexing::query_embedding(a, t, query).await
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
    let rows = sqlx::query(include_str!("search.sql"))
        .bind(t)
        .bind(product)
        .bind(query)
        .bind(public)
        .bind(ids)
        .bind(digests)
        .bind(&model)
        .bind(locale)
        .bind(&settings.main_locale)
        .fetch_all(&a.db)
        .await?;
    Ok(json!(rows.iter().map(|r|json!({"sourceId":format!("{}:{}",r.get::<String,_>("id"),r.get::<i32,_>("position")),"documentId":r.get::<String,_>("id"),"title":r.get::<String,_>("title"),"locale":r.get::<String,_>("locale"),"productId":r.get::<Option<String>,_>("product_id"),"appliesToProductId":product,"association":if r.get::<Option<String>,_>("product_id").is_none(){"shop"}else if product.is_none() || r.get::<Option<String>,_>("product_id").as_deref()==product{"product"}else{"product-family"},"sourceType":r.get::<String,_>("source_type"),"contentHash":r.get::<String,_>("content_hash"),"revision":r.get::<i64,_>("revision"),"text":r.get::<String,_>("text")})).collect::<Vec<_>>()))
}
pub(crate) async fn index(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM knowledge_documents WHERE tenant=$1 AND id=$2)",
    )
    .bind(&t)
    .bind(&id)
    .fetch_one(&a.db)
    .await?;
    if !exists {
        return Err(Error(StatusCode::NOT_FOUND, "Document not found".into()));
    }
    let queued = cognition::indexing::enqueue(&a, &t, Some(&id)).await?;
    Ok(Json(
        json!({"queued":queued,"indexed":0,"model":cognition::indexing::model(),"asynchronous":true}),
    ))
}
