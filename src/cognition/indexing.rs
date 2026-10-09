//! Durable bounded embedding jobs; short claims and revision fences keep provider latency outside PostgreSQL.
use super::*;
pub(crate) fn model() -> String {
    env::var("EMBEDDING_MODEL").unwrap_or("qwen3-embedding:0.6b".into())
}
/// Interactive embedding reads share the same process and fleet admission as background indexing.
pub(crate) async fn query_embedding(a: &App, t: &str, text: &str) -> Option<Vec<f32>> {
    let _slot = a.inference_slots.clone().try_acquire_owned().ok()?;
    let _lease = crate::performance::cluster_lease::Lease::acquire(a, t, "embedding", 1)
        .await
        .ok()?;
    let (endpoint, key, _) = a.inference.connection("ollama").await.unwrap_or_default();
    if endpoint.is_empty() && env::var("EMBEDDING_BASE_URL").is_err() {
        return None;
    }
    knowledge::embedding(&a.http, &endpoint, key.as_deref(), &model(), text)
        .await
        .ok()
}
pub(crate) async fn enqueue(a: &App, t: &str, document: Option<&str>) -> Result<i64> {
    let sql = if document.is_some() {
        "INSERT INTO embedding_jobs(tenant,kind,object_id) SELECT tenant,'document',document_id||':'||position FROM knowledge_chunks WHERE tenant=$1 AND document_id=$2 AND (embedding IS NULL OR embedding_model<>$3 OR EXISTS(SELECT 1 FROM embedding_jobs j WHERE j.tenant=knowledge_chunks.tenant AND j.kind='document' AND j.object_id=knowledge_chunks.document_id||':'||knowledge_chunks.position)) ON CONFLICT(tenant,kind,object_id) DO UPDATE SET available_at=now(),attempts=0,error_code=NULL"
    } else {
        "INSERT INTO embedding_jobs(tenant,kind,object_id) SELECT p.tenant,'product',p.id FROM products p LEFT JOIN semantic_products s ON s.tenant=p.tenant AND s.product_id=p.id WHERE p.tenant=$1 AND ($2::text IS NULL) AND (s.product_id IS NULL OR s.embedding_model<>$3 OR s.content_hash<>encode(sha256(convert_to(p.name||E'\\n'||p.category||E'\\n'||p.description,'UTF8')),'hex') OR EXISTS(SELECT 1 FROM embedding_jobs j WHERE j.tenant=p.tenant AND j.kind='product' AND j.object_id=p.id)) ON CONFLICT(tenant,kind,object_id) DO UPDATE SET available_at=now(),attempts=0,error_code=NULL"
    };
    let query = sqlx::query(sql).bind(t).bind(document).bind(model());
    let count = query.execute(&a.db).await?.rows_affected() as i64;
    Ok(count)
}
pub(crate) async fn index_once(a: &App) -> Result<bool> {
    let advanced = super::generations::advance(a).await?;
    let model = model();
    let mut tx = a.db.begin().await?;
    let jobs = sqlx::query(include_str!("index_claim.sql"))
        .bind(uid())
        .fetch_all(&mut *tx)
        .await?;
    tx.commit().await?;
    if jobs.is_empty() {
        return Ok(advanced);
    }
    let tenant: String = jobs[0].get("tenant");
    let mut sources = Vec::new();
    for job in &jobs {
        let kind: String = job.get("kind");
        let id: String = job.get("object_id");
        let text: Option<String> = if kind == "product" {
            sqlx::query_scalar("SELECT name||E'\\n'||category||E'\\n'||description FROM products WHERE tenant=$1 AND id=$2").bind(&tenant).bind(&id).fetch_optional(&a.db).await?
        } else {
            sqlx::query_scalar("SELECT text FROM knowledge_chunks WHERE tenant=$1 AND document_id||':'||position=$2").bind(&tenant).bind(&id).fetch_optional(&a.db).await?
        };
        if let Some(text) = text {
            sources.push((job, text));
        } else {
            acknowledge(a, job).await?;
        }
    }
    if sources.is_empty() {
        return Ok(true);
    }
    let (url, key, _) = a.inference.connection("ollama").await.unwrap_or_default();
    let url = env::var("EMBEDDING_BASE_URL").unwrap_or(url);
    let key = env::var("EMBEDDING_API_KEY").ok().or(key);
    let texts = sources
        .iter()
        .map(|(_, text)| text.clone())
        .collect::<Vec<_>>();
    let slot = a.inference_slots.clone().try_acquire_owned().ok();
    let lease = if slot.is_some() {
        crate::performance::cluster_lease::Lease::acquire(a, &tenant, "embedding", 1)
            .await
            .ok()
    } else {
        None
    };
    let result = if lease.is_some() {
        knowledge::embeddings::batch(&a.http, &url, key.as_deref(), &model, &texts).await
    } else {
        Err("Embedding admission busy".into())
    };
    drop(lease);
    drop(slot);
    match result {
        Ok(vectors) => {
            for ((job, text), vector) in sources.into_iter().zip(vectors) {
                let mut tx = a.db.begin().await?;
                // Match source mutation lock order (source first, queue second).
                if job.get::<String, _>("kind") == "product" {
                    sqlx::query("SELECT id FROM products WHERE tenant=$1 AND id=$2 FOR SHARE")
                        .bind(&tenant)
                        .bind(job.get::<String, _>("object_id"))
                        .fetch_optional(&mut *tx)
                        .await?;
                } else {
                    sqlx::query("SELECT position FROM knowledge_chunks WHERE tenant=$1 AND document_id||':'||position=$2 FOR SHARE").bind(&tenant).bind(job.get::<String,_>("object_id")).fetch_optional(&mut *tx).await?;
                }
                let current:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM embedding_jobs WHERE tenant=$1 AND kind=$2 AND object_id=$3 AND revision=$4 AND lease=$5 AND lease_until>now() FOR UPDATE)")
                .bind(&tenant).bind(job.get::<String,_>("kind")).bind(job.get::<String,_>("object_id")).bind(job.get::<i64,_>("revision")).bind(job.get::<String,_>("lease")).fetch_one(&mut *tx).await?;
                if !current {
                    continue;
                }
                if job.get::<String, _>("kind") == "product" {
                    sqlx::query("INSERT INTO semantic_products(tenant,product_id,revision,embedding,embedding_model,content_hash) SELECT tenant,id,revision,$3,$4,$5 FROM products WHERE tenant=$1 AND id=$2 AND name||E'\\n'||category||E'\\n'||description=$6 ON CONFLICT(tenant,product_id) DO UPDATE SET revision=EXCLUDED.revision,embedding=EXCLUDED.embedding,embedding_model=EXCLUDED.embedding_model,content_hash=EXCLUDED.content_hash,updated_at=now()")
                    .bind(&tenant).bind(job.get::<String,_>("object_id")).bind(vector).bind(&model).bind(hash(&text)).bind(&text).execute(&mut *tx).await?;
                } else {
                    sqlx::query("UPDATE knowledge_chunks SET embedding=$3,embedding_model=$4 WHERE tenant=$1 AND document_id||':'||position=$2 AND text=$5")
                    .bind(&tenant).bind(job.get::<String,_>("object_id")).bind(vector).bind(&model).bind(text).execute(&mut *tx).await?;
                }
                sqlx::query("DELETE FROM embedding_jobs WHERE tenant=$1 AND kind=$2 AND object_id=$3 AND revision=$4 AND lease=$5")
                .bind(&tenant).bind(job.get::<String,_>("kind")).bind(job.get::<String,_>("object_id")).bind(job.get::<i64,_>("revision")).bind(job.get::<String,_>("lease")).execute(&mut *tx).await?;
                tx.commit().await?;
            }
        }
        Err(error) => {
            let code = if error.contains("admission") {
                "embedding_admission_busy"
            } else if error.contains("limit") {
                "embedding_source_limit"
            } else if error.contains("HTTP") {
                "embedding_provider_rejected"
            } else if error.contains("mismatch")
                || error.contains("Invalid")
                || error.contains("Missing")
            {
                "embedding_invalid_response"
            } else {
                "embedding_provider_unavailable"
            };
            for (job, _) in sources {
                sqlx::query("UPDATE embedding_jobs SET attempts=attempts+CASE WHEN $6='embedding_admission_busy' THEN 0 ELSE 1 END,error_code=$6,lease=NULL,lease_until=NULL,available_at=now()+least(300,power(2,attempts+1)::int)*interval '1 second' WHERE tenant=$1 AND kind=$2 AND object_id=$3 AND revision=$4 AND lease=$5")
                .bind(&tenant).bind(job.get::<String,_>("kind")).bind(job.get::<String,_>("object_id")).bind(job.get::<i64,_>("revision")).bind(job.get::<String,_>("lease")).bind(code).execute(&a.db).await?;
            }
        }
    }
    Ok(true)
}
async fn acknowledge(a: &App, job: &sqlx::postgres::PgRow) -> Result<()> {
    sqlx::query("DELETE FROM embedding_jobs WHERE tenant=$1 AND kind=$2 AND object_id=$3 AND revision=$4 AND lease=$5")
        .bind(job.get::<String,_>("tenant")).bind(job.get::<String,_>("kind")).bind(job.get::<String,_>("object_id")).bind(job.get::<i64,_>("revision")).bind(job.get::<String,_>("lease")).execute(&a.db).await?;
    Ok(())
}
