//! Private Qdrant adapter: tenant/model filters, deterministic identities and durable PostgreSQL index queue.
use super::*;
use sha2::{Digest, Sha256};
use std::time::Duration;
fn collection(kind: &str, model: &str) -> String {
    format!("vendune_{kind}_{}", hex(model).get(..16).unwrap())
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
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Qdrant client")?;
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
    response
        .json()
        .await
        .map_err(|_| "Invalid Qdrant response".into())
}
async fn ensure(kind: &str, model: &str) -> Result<String, String> {
    let name = collection(kind, model);
    if request(reqwest::Method::GET, &format!("/collections/{name}"), None)
        .await
        .is_err()
    {
        // Concurrent startup may create the collection first; verify the actual shape afterwards.
        let _ = request(
            reqwest::Method::PUT,
            &format!("/collections/{name}"),
            Some(json!({"vectors":{"size":1024,"distance":"Cosine"},"on_disk_payload":true})),
        )
        .await;
    }
    let info = request(reqwest::Method::GET, &format!("/collections/{name}"), None).await?;
    let v = &info["result"]["config"]["params"]["vectors"];
    if v["size"] != 1024 || v["distance"] != "Cosine" {
        return Err("Qdrant collection shape mismatch".into());
    }
    request(
        reqwest::Method::PUT,
        &format!("/collections/{name}/index?wait=true"),
        Some(json!({"field_name":"tenant","field_schema":{"type":"keyword","is_tenant":true}})),
    )
    .await?;
    Ok(name)
}
pub async fn query(
    kind: &str,
    tenant: &str,
    model: &str,
    vector: Vec<f32>,
) -> Result<Vec<Value>, String> {
    if vector.len() != 1024 || vector.iter().any(|v| !v.is_finite()) {
        return Err("Invalid query vector".into());
    }
    let name = collection(kind, model);
    let response=request(reqwest::Method::POST,&format!("/collections/{name}/points/query"),Some(json!({"query":vector,"filter":{"must":[{"key":"tenant","match":{"value":tenant}},{"key":"model","match":{"value":model}}]},"limit":64,"with_payload":true,"with_vector":false}))).await?;
    Ok(response["result"]["points"]
        .as_array()
        .ok_or("Invalid query result")?
        .clone())
}
pub async fn drain(db: &PgPool) -> Result<usize, String> {
    let mut tx = db.begin().await.map_err(|_| "Index transaction")?;
    let rows=sqlx::query("SELECT tenant,kind,object_id FROM vector_index_queue ORDER BY updated_at,tenant,kind,object_id LIMIT 16 FOR UPDATE SKIP LOCKED").fetch_all(&mut *tx).await.map_err(|_|"Index queue")?;
    for row in &rows {
        let tenant: String = row.get("tenant");
        let kind: String = row.get("kind");
        let id: String = row.get("object_id");
        let current=if kind=="product"{
            sqlx::query("SELECT embedding,embedding_model AS model,content_hash AS digest FROM semantic_products WHERE tenant=$1 AND product_id=$2").bind(&tenant).bind(&id).fetch_optional(&mut *tx).await
        }else{
            sqlx::query("SELECT c.embedding,c.embedding_model AS model,d.content_hash AS digest FROM knowledge_chunks c JOIN knowledge_documents d ON d.tenant=c.tenant AND d.id=c.document_id WHERE c.tenant=$1 AND c.document_id||':'||c.position=$2 AND c.embedding IS NOT NULL").bind(&tenant).bind(&id).fetch_optional(&mut *tx).await
        }.map_err(|_|"Index source")?;
        if let Some(current) = current {
            let model: String = current.get("model");
            let embedding: Vec<f32> = current.get("embedding");
            let digest: String = current.get("digest");
            let name = ensure(&kind, &model).await?;
            request(reqwest::Method::PUT,&format!("/collections/{name}/points?wait=true"),Some(json!({"points":[{"id":point(&tenant,&kind,&id),"vector":embedding,"payload":{"tenant":tenant,"object_id":id,"model":model,"digest":digest}}]}))).await?;
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
        sqlx::query("DELETE FROM vector_index_queue WHERE tenant=$1 AND kind=$2 AND object_id=$3")
            .bind(&tenant)
            .bind(&kind)
            .bind(&id)
            .execute(&mut *tx)
            .await
            .map_err(|_| "Index acknowledgment")?;
    }
    tx.commit().await.map_err(|_| "Index commit")?;
    Ok(rows.len())
}
pub fn start(db: PgPool) {
    if std::env::var("QDRANT_URL").is_err() {
        return;
    }
    tokio::spawn(async move {
        loop {
            if let Err(e) = drain(&db).await {
                eprintln!("vector index: {e}");
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}
