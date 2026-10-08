//! Restart-safe model-change intake: short locked cursor batches reuse the canonical embedding queue.
use super::*;
pub(crate) async fn advance(a: &App) -> Result<bool> {
    let model = indexing::model();
    if model.is_empty() || model.len() > 256 {
        return Err(bad("Embedding model must contain 1–256 bytes"));
    }
    let mut tx = a.db.begin().await?;
    // At most one tenant enters a generation per tick; do not scan every product at startup.
    sqlx::query("INSERT INTO embedding_generations(tenant,model) SELECT t.id,$1 FROM tenants t LEFT JOIN embedding_generations g ON g.tenant=t.id WHERE t.status='active' AND (g.tenant IS NULL OR g.model<>$1) ORDER BY t.id LIMIT 1 ON CONFLICT(tenant) DO UPDATE SET model=EXCLUDED.model,phase='product',cursor='',updated_at=now() WHERE embedding_generations.model<>EXCLUDED.model")
        .bind(&model).execute(&mut *tx).await?;
    let row=sqlx::query("SELECT tenant,phase,cursor FROM embedding_generations WHERE model=$1 AND phase<>'complete' ORDER BY updated_at,tenant LIMIT 1 FOR UPDATE SKIP LOCKED")
        .bind(&model).fetch_optional(&mut *tx).await?;
    let Some(row) = row else {
        tx.commit().await?;
        return Ok(false);
    };
    let tenant: String = row.get("tenant");
    let phase: String = row.get("phase");
    let cursor: String = row.get("cursor");
    let sql = if phase == "product" {
        "SELECT id AS key FROM products WHERE tenant=$1 AND id>$2 ORDER BY id LIMIT 256"
    } else {
        "SELECT document_id||':'||position AS key FROM knowledge_chunks WHERE tenant=$1 AND document_id||':'||position>$2 ORDER BY document_id||':'||position LIMIT 256"
    };
    let keys: Vec<String> = sqlx::query_scalar(sql)
        .bind(&tenant)
        .bind(cursor)
        .fetch_all(&mut *tx)
        .await?;
    if let Some(last) = keys.last() {
        // Changing the target model fences any in-flight old-model write before it can publish.
        sqlx::query("INSERT INTO embedding_jobs(tenant,kind,object_id) SELECT $1,$2,unnest($3::text[]) ON CONFLICT(tenant,kind,object_id) DO UPDATE SET revision=embedding_jobs.revision+1,attempts=0,error_code=NULL,available_at=now(),lease=NULL,lease_until=NULL")
            .bind(&tenant).bind(&phase).bind(&keys).execute(&mut *tx).await?;
        sqlx::query("UPDATE embedding_generations SET cursor=$2,updated_at=now() WHERE tenant=$1")
            .bind(&tenant)
            .bind(last)
            .execute(&mut *tx)
            .await?;
    } else {
        let next = if phase == "product" {
            "document"
        } else {
            "complete"
        };
        sqlx::query(
            "UPDATE embedding_generations SET phase=$2,cursor='',updated_at=now() WHERE tenant=$1",
        )
        .bind(&tenant)
        .bind(next)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(true)
}
