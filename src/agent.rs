//! Persistent grounded conversations and tenant-scoped semantic knowledge HTTP adapters.
use super::*;

pub(super) fn choice(v: &Value) -> Result<Option<Choice>> {
    v.get("inference")
        .map(|v| serde_json::from_value(v.clone()).map_err(|_| bad("Invalid inference selection")))
        .transpose()
}
pub(super) async fn model_providers(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    Ok(Json(a.inference.providers()))
}
pub(super) async fn knowledge_graph(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    Ok(Json(knowledge::graph(&a.db, &tenant(&h)?).await?))
}
pub(super) async fn knowledge_status(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rows = sqlx::query("SELECT product_id,embedding_model,content_hash,md5(embedding::text) AS vector_digest FROM semantic_products WHERE tenant=$1 ORDER BY product_id")
        .bind(t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"indexedProducts":rows.len(),"documents":rows.iter().map(|r|json!({"productId":r.get::<String,_>("product_id"),"model":r.get::<String,_>("embedding_model"),"contentHash":r.get::<String,_>("content_hash"),"vectorDigest":r.get::<String,_>("vector_digest")})).collect::<Vec<_>>()}),
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
        "SELECT count(*) FROM semantic_products WHERE tenant=$1 AND embedding_model=$2",
    )
    .bind(t)
    .bind(&model)
    .fetch_one(&a.db)
    .await?;
    let vector = if count > 0 {
        Some(
            knowledge::embedding(
                &a.http,
                &a.ollama,
                &model,
                &format!("Instruct: Retrieve suitable commerce products.\nQuery: {q}"),
            )
            .await
            .map_err(|e| Error(StatusCode::BAD_GATEWAY, e))?,
        )
    } else {
        None
    };
    let mut result = knowledge::search(&a.db, t, q, vector, &model).await?;
    result["embeddingModel"] = json!(model);
    result["indexedProducts"] = json!(count);
    Ok(result)
}
pub(super) async fn semantic_search(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    Ok(Json(
        retrieve(&a, &tenant(&h)?, v["query"].as_str().unwrap_or("")).await?,
    ))
}
pub(super) async fn reindex(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let model = embedding_model();
    let mut count = 0;
    let ps = products(&a, &t).await?;
    if ps.len() > 100 {
        return Err(bad("Prototype indexing batch is limited to 100 products"));
    }
    for p in ps {
        let doc = format!("{}\n{}\n{}", p.name, p.category, p.description);
        let digest = hash(&doc);
        let current:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM semantic_products WHERE tenant=$1 AND product_id=$2 AND content_hash=$3 AND embedding_model=$4)").bind(&t).bind(&p.id).bind(&digest).bind(&model).fetch_one(&a.db).await?;
        if current {
            continue;
        }
        let embedding = knowledge::embedding(&a.http, &a.ollama, &model, &doc)
            .await
            .map_err(|e| Error(StatusCode::BAD_GATEWAY, e))?;
        sqlx::query("INSERT INTO semantic_products(tenant,product_id,revision,embedding,embedding_model,content_hash) VALUES($1,$2,$3,$4::text::vector,$5,$6) ON CONFLICT(tenant,product_id) DO UPDATE SET revision=EXCLUDED.revision,embedding=EXCLUDED.embedding,embedding_model=EXCLUDED.embedding_model,content_hash=EXCLUDED.content_hash,updated_at=now()").bind(&t).bind(&p.id).bind(p.revision).bind(serde_json::to_string(&embedding).unwrap()).bind(&model).bind(digest).execute(&a.db).await?;
        count += 1;
    }
    Ok(Json(
        json!({"indexed":count,"model":model,"engine":"pgvector","dimensions":1024}),
    ))
}
pub(super) async fn conversations(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rows=sqlx::query("SELECT id,title,created_at::text AS created_at FROM conversations WHERE tenant=$1 ORDER BY created_at DESC LIMIT 40").bind(t).fetch_all(&a.db).await?;
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
    h: HeaderMap,
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
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
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
    // Try-lock a transaction to reject simultaneous turns, rather than replaying
    // inconsistent conversation histories. No product locks during inference.
    let mut lock = a.db.begin().await?;
    let admitted: bool =
        sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,2))")
            .bind(format!("{t}:{id}"))
            .fetch_one(&mut *lock)
            .await?;
    if !admitted {
        return Err(conflict("A turn is already running in this conversation"));
    }
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
    let output = plan_with(
        &a,
        &t,
        instruction,
        selection.as_ref(),
        &history,
        &language_context(&a, &h).await?.0,
    )
    .await;
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
    sqlx::query("INSERT INTO chat_messages(tenant,conversation_id,role,content,data) VALUES($1,$2,'assistant',$3,$4)").bind(&t).bind(&id).bind(content).bind(data).execute(&a.db).await?;
    lock.commit().await?;
    Ok(Json(
        json!({"conversationId":id,"messages":messages(&a,&t,&id).await?}),
    ))
}
