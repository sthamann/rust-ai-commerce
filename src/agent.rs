//! Persistent grounded conversations and tenant-scoped semantic knowledge HTTP adapters.
use super::*;

pub(super) fn choice(v: &Value) -> Result<Option<Choice>> {
    v.get("inference")
        .map(|v| serde_json::from_value(v.clone()).map_err(|_| bad("Invalid inference selection")))
        .transpose()
}
pub(super) async fn model_providers(
    State(a): State<App>,
    h: RequestContext,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    Ok(Json(a.inference.public_providers().await.map_err(bad)?))
}
pub(super) async fn knowledge_graph(
    State(a): State<App>,
    h: RequestContext,
) -> Result<Json<Value>> {
    Ok(Json(knowledge::graph(&a.db, &tenant(&h)?).await?))
}
pub(super) async fn knowledge_status(
    State(a): State<App>,
    h: RequestContext,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rows = sqlx::query("SELECT product_id,embedding_model,content_hash,vector_digest FROM semantic_products WHERE tenant=$1 ORDER BY product_id LIMIT 200")
        .bind(&t).fetch_all(&a.db).await?;
    let status = sqlx::query(
        "SELECT indexed_products,pending_jobs FROM knowledge_index_status WHERE tenant=$1",
    )
    .bind(&t)
    .fetch_optional(&a.db)
    .await?;
    let errors:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('code',e.key,'count',e.value) FROM knowledge_index_status s CROSS JOIN LATERAL jsonb_each(s.errors) e WHERE tenant=$1 ORDER BY e.key LIMIT 16").bind(&t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"indexedProducts":status.as_ref().map(|r|r.get::<i64,_>("indexed_products")).unwrap_or(0),"pending":status.as_ref().map(|r|r.get::<i64,_>("pending_jobs")).unwrap_or(0),"errors":errors,"documentsLimit":200,"documents":rows.iter().map(|r|json!({"productId":r.get::<String,_>("product_id"),"model":r.get::<String,_>("embedding_model"),"contentHash":r.get::<String,_>("content_hash"),"vectorDigest":r.get::<String,_>("vector_digest")})).collect::<Vec<_>>()}),
    ))
}
fn embedding_model() -> String {
    env::var("EMBEDDING_MODEL").unwrap_or("qwen3-embedding:0.6b".into())
}
pub(super) async fn retrieve(a: &App, t: &str, q: &str) -> Result<Value> {
    if q.is_empty() || q.len() > 2000 {
        return Err(bad("Query must contain 1..2000 characters"));
    }
    let model = embedding_model();
    let count: i64 = sqlx::query_scalar(
        "SELECT CASE WHEN EXISTS(SELECT 1 FROM semantic_products WHERE tenant=$1 AND embedding_model=$2) THEN 1::bigint ELSE 0::bigint END",
    )
    .bind(t)
    .bind(&model)
    .fetch_one(&a.db)
    .await?;
    let vector = if count > 0 {
        cognition::indexing::query_embedding(
            a,
            t,
            &format!("Instruct: Retrieve suitable commerce products.\nQuery: {q}"),
        )
        .await
    } else {
        None
    };
    let mut result = knowledge::search(&a.db, t, q, vector, &model).await?;
    if env::var("RERANKER_URL").is_ok()
        && let Ok(_slot) = a.inference_slots.clone().try_acquire_owned()
        && let Ok(_lease) =
            crate::performance::cluster_lease::Lease::acquire(a, t, "reranker", 1).await
        && let Some(hits) = result["hits"].as_array_mut()
    {
        let reranked = knowledge::rerank::apply(t, q, hits, &a.db).await;
        result["reranked"] = json!(reranked);
    }
    result["embeddingModel"] = json!(model);
    result["hasIndexedProducts"] = json!(count > 0);
    Ok(result)
}
pub(super) async fn semantic_search(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    Ok(Json(
        retrieve(&a, &tenant(&h)?, v["query"].as_str().unwrap_or("")).await?,
    ))
}
pub(super) async fn reindex(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let queued = cognition::indexing::enqueue(&a, &t, None).await?;
    Ok(Json(
        json!({"queued":queued,"indexed":0,"model":embedding_model(),"engine":"Qdrant","asynchronous":true}),
    ))
}
pub(super) async fn conversations(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rows=sqlx::query("SELECT id,title,created_at::text AS created_at FROM conversations WHERE tenant=$1 ORDER BY created_at DESC LIMIT 40").bind(&t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"conversations":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"title":r.get::<String,_>("title"),"createdAt":r.get::<String,_>("created_at")})).collect::<Vec<_>>()}),
    ))
}
async fn messages(a: &App, t: &str, id: &str) -> Result<Vec<Value>> {
    // Task state is joined on read so approval remains visible after reload.
    let rows=sqlx::query("SELECT m.id,m.role,m.content,m.data,coalesce(k.applied,false) AS applied FROM (SELECT * FROM chat_messages WHERE tenant=$1 AND conversation_id=$2 ORDER BY id DESC LIMIT 200) m LEFT JOIN tasks k ON k.tenant=m.tenant AND k.id=m.data->>'taskId' WHERE m.tenant=$1 AND m.conversation_id=$2 ORDER BY m.id LIMIT 200").bind(t).bind(id).fetch_all(&a.db).await?;
    Ok(rows.iter().map(|r|json!({"id":r.get::<i64,_>("id"),"role":r.get::<String,_>("role"),"content":r.get::<String,_>("content"),"data":r.get::<Value,_>("data"),"applied":r.get::<bool,_>("applied")})).collect())
}
pub(super) async fn conversation(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM conversations WHERE tenant=$1 AND id=$2)")
            .bind(&t)
            .bind(&id)
            .fetch_one(&a.db)
            .await?;
    if !exists {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Conversation not found".into(),
        ));
    }
    Ok(Json(
        json!({"conversationId":id,"messages":messages(&a,&t,&id).await?}),
    ))
}
pub(super) async fn merchant_chat(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "knowledge.read")?;
    let instruction = v["message"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 4000)
        .ok_or(bad("Message must contain 1..4000 characters"))?;
    let selection = choice(&v)?;
    let id = if let Some(id) = v["conversationId"].as_str() {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM conversations WHERE tenant=$1 AND id=$2)",
        )
        .bind(&t)
        .bind(id)
        .fetch_one(&a.db)
        .await?;
        if !exists {
            return Err(Error(
                StatusCode::NOT_FOUND,
                "Conversation not found".into(),
            ));
        }
        id.to_string()
    } else {
        let id = uid();
        let title = instruction.chars().take(70).collect::<String>();
        sqlx::query("INSERT INTO conversations(tenant,id,title) VALUES($1,$2,$3)")
            .bind(&t)
            .bind(&id)
            .bind(title)
            .execute(&a.db)
            .await?;
        id
    };
    let owner = chat_lease::admit(&a, &t, &id).await?;
    let previous = messages(&a, &t, &id).await?;
    let history = previous
        .iter()
        .rev()
        .take(16)
        .rev()
        .map(|v| {
            format!(
                "{}: {}",
                v["role"].as_str().unwrap_or(""),
                v["content"].as_str().unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    sqlx::query(
        "INSERT INTO chat_messages(tenant,conversation_id,role,content) VALUES($1,$2,'user',$3)",
    )
    .bind(&t)
    .bind(&id)
    .bind(instruction)
    .execute(&a.db)
    .await?;
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(190),
        plan_with(
            &a,
            &t,
            instruction,
            selection.as_ref(),
            &history,
            &language_context(&a, &h).await?.0,
            &h,
        ),
    )
    .await
    .unwrap_or_else(|_| {
        Err(Error(
            StatusCode::GATEWAY_TIMEOUT,
            "Model turn timed out".into(),
        ))
    });
    let (content, data) = match output {
        Ok(task) => (
            task["preview"]["proposal"]["summary"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            task,
        ),
        Err(e) => (
            e.1,
            json!({"error":true,"providerUnavailable":e.0==StatusCode::BAD_GATEWAY}),
        ),
    };
    chat_lease::release(&a, &t, &id, &owner, &content, &data).await?;
    Ok(Json(
        json!({"conversationId":id,"messages":messages(&a,&t,&id).await?}),
    ))
}
