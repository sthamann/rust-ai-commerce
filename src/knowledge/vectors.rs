//! Private Qdrant adapter: tenant/model filters, deterministic identities and durable PostgreSQL index queue.
use super::*;
use sha2::{Digest, Sha256};
use std::time::Duration;
fn collection(kind: &str, model: &str, dimensions: usize) -> String {
    format!(
        "vendune_{kind}_v2_{}_{dimensions}",
        hex(model).get(..16).unwrap()
    )
}
fn hex(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
fn point(tenant: &str, kind: &str, id: &str) -> String {
    let digest = Sha256::digest(json!([tenant, kind, id]).to_string().as_bytes());
    uuid::Uuid::from_slice(&digest[..16]).unwrap().to_string()
}
async fn request(
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let url = std::env::var("QDRANT_URL").map_err(|_| "Qdrant is not configured")?;
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    let client = CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("Qdrant HTTP client")
    });
    let mut req = client.request(method, format!("{}{path}", url.trim_end_matches('/')));
    if let Ok(key) = std::env::var("QDRANT_API_KEY") {
        req = req.header("api-key", key);
    }
    if let Some(body) = body {
        req = req.json(&body);
    }
    let response = req.send().await.map_err(|_| "Qdrant unavailable")?;
    if !response.status().is_success() {
        return Err(format!("Qdrant HTTP {}", response.status().as_u16()));
    }
    crate::http_json::bounded(response, 2 * 1024 * 1024).await
}
async fn ensure(kind: &str, model: &str, dimensions: usize) -> Result<String, String> {
    let name = collection(kind, model, dimensions);
    let cache_key = format!("{}:{name}", std::env::var("QDRANT_URL").unwrap_or_default());
    if super::vector_cache::ready(&cache_key) {
        return Ok(name);
    }
    if request(reqwest::Method::GET, &format!("/collections/{name}"), None)
        .await
        .is_err()
    {
        // Concurrent startup may create the collection first; verify the actual shape afterwards.
        let _ = request(
            reqwest::Method::PUT,
            &format!("/collections/{name}"),
            Some(json!({"vectors":{"text":{"size":dimensions,"distance":"Cosine","on_disk":true}},"quantization_config":if std::env::var("QDRANT_QUANTIZATION").as_deref()==Ok("int8"){json!({"scalar":{"type":"int8","quantile":0.99,"always_ram":true}})}else{Value::Null},"on_disk_payload":true})),
        )
        .await;
    }
    let info = request(reqwest::Method::GET, &format!("/collections/{name}"), None).await?;
    let v = &info["result"]["config"]["params"]["vectors"]["text"];
    if v["size"] != dimensions || v["distance"] != "Cosine" {
        return Err("Qdrant collection shape mismatch".into());
    }
    request(
        reqwest::Method::PUT,
        &format!("/collections/{name}/index?wait=true"),
        Some(json!({"field_name":"tenant","field_schema":{"type":"keyword","is_tenant":true}})),
    )
    .await?;
    super::vector_cache::verified(cache_key);
    Ok(name)
}
pub async fn query(
    kind: &str,
    tenant: &str,
    model: &str,
    vector: Vec<f32>,
) -> Result<Vec<Value>, String> {
    if !super::embeddings::valid(&vector) {
        return Err("Invalid query vector".into());
    }
    let name = collection(kind, model, vector.len());
    let response=request(reqwest::Method::POST,&format!("/collections/{name}/points/query"),Some(json!({"query":vector,"using":"text","filter":{"must":[{"key":"tenant","match":{"value":tenant}},{"key":"model","match":{"value":model}}]},"limit":64,"with_payload":true,"with_vector":false}))).await?;
    Ok(response["result"]["points"]
        .as_array()
        .ok_or("Invalid query result")?
        .clone())
}
pub async fn drain(db: &PgPool) -> Result<usize, String> {
    let mut tx = db.begin().await.map_err(|_| "Index transaction")?;
    let lease = uuid::Uuid::new_v4().to_string();
    let rows = sqlx::query(include_str!("vector_claim.sql"))
        .bind(&lease)
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| "Index queue")?;
    tx.commit().await.map_err(|_| "Index claim commit")?;
    for row in &rows {
        let result:Result<(),String>=async {
        let tenant: String = row.get("tenant");
        let kind: String = row.get("kind");
        let id: String = row.get("object_id");
        let current=if kind=="product"{
            sqlx::query("SELECT embedding,embedding_model AS model,content_hash AS digest FROM semantic_products WHERE tenant=$1 AND product_id=$2").bind(&tenant).bind(&id).fetch_optional(db).await
        }else{
            sqlx::query("SELECT c.embedding,c.embedding_model AS model,d.content_hash AS digest FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE c.tenant=$1 AND c.document_id||':'||c.position=$2 AND c.embedding IS NOT NULL").bind(&tenant).bind(&id).fetch_optional(db).await
        }.map_err(|_|"Index source")?;
        if let Some(current) = current {
            let model: String = current.get("model");
            let embedding: Vec<f32> = current.get("embedding");
            let digest: String = current.get("digest");
            let name = ensure(&kind, &model, embedding.len()).await?;
            request(reqwest::Method::PUT,&format!("/collections/{name}/points?wait=true"),Some(json!({"points":[{"id":point(&tenant,&kind,&id),"vector":{"text":embedding},"payload":{"tenant":tenant,"object_id":id,"model":model,"digest":digest}}]}))).await?;
        } else {
            let collections = request(reqwest::Method::GET, "/collections", None).await?;
            for name in collections["result"]["collections"]
                .as_array()
                .ok_or("Invalid collections")?
                .iter()
                .filter_map(|c| c["name"].as_str())
                .filter(|n| n.starts_with(&format!("vendune_{kind}_")))
            {
                request(
                    reqwest::Method::POST,
                    &format!("/collections/{name}/points/delete?wait=true"),
                    Some(json!({"points":[point(&tenant,&kind,&id)]})),
                )
                .await?;
            }
        }
        Ok(())
        }.await;
        if result.is_ok() {
            sqlx::query("DELETE FROM vector_index_queue WHERE tenant=$1 AND kind=$2 AND object_id=$3 AND revision=$4 AND lease=$5")
            .bind(row.get::<String,_>("tenant")).bind(row.get::<String,_>("kind")).bind(row.get::<String,_>("object_id")).bind(row.get::<i64,_>("revision")).bind(&lease).execute(db).await.map_err(|_|"Index acknowledgment")?;
        } else {
            sqlx::query("UPDATE vector_index_queue SET attempts=attempts+1,lease=NULL,lease_until=NULL,error_code='vector_publication_unavailable',available_at=now()+least(300,power(2,least(attempts+1,8))::int)*interval '1 second' WHERE tenant=$1 AND kind=$2 AND object_id=$3 AND revision=$4 AND lease=$5")
            .bind(row.get::<String,_>("tenant")).bind(row.get::<String,_>("kind")).bind(row.get::<String,_>("object_id")).bind(row.get::<i64,_>("revision")).bind(&lease).execute(db).await.map_err(|_|"Index retry")?;
        }
    }
    Ok(rows.len())
}
pub fn start(db: PgPool) {
    if std::env::var("QDRANT_URL").is_err() {
        return;
    }
    crate::tenant_scope::spawn(async move {
        loop {
            match drain(&db).await {
                Ok(0) => {}
                Ok(_) => {
                    // Drain ready work without a fixed per-batch throughput ceiling.
                    // Failed jobs have a future available_at and cannot spin here.
                    tokio::task::yield_now().await;
                    continue;
                }
                Err(e) => eprintln!("vector index: {e}"),
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}
