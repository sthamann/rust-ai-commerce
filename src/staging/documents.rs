//! Knowledge documents/chunks clone and publish with their source provenance; publication visibility is a reviewed unit.
use super::*;
pub(super) async fn clone_sources(tx: &mut Tx<'_>, live: &str, stage: &str) -> Result<()> {
    sqlx::query("INSERT INTO knowledge_documents SELECT (jsonb_populate_record(NULL::knowledge_documents,to_jsonb(d)||jsonb_build_object('tenant',$2::text))).* FROM knowledge_documents d WHERE tenant=$1").bind(live).bind(stage).execute(&mut **tx).await?;
    sqlx::query("INSERT INTO knowledge_chunks SELECT (jsonb_populate_record(NULL::knowledge_chunks,to_jsonb(c)||jsonb_build_object('tenant',$2::text))).* FROM knowledge_chunks c WHERE tenant=$1").bind(live).bind(stage).execute(&mut **tx).await?;
    let products = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND (parent_id IS NULL OR id IN (SELECT product_id FROM knowledge_documents WHERE tenant=$1))")
        .bind(stage)
        .fetch_all(&mut **tx)
        .await?;
    for r in products {
        knowledge::sync_product(tx, stage, &json!(crate::product(&r))).await?;
    }
    let docs = sqlx::query("SELECT * FROM knowledge_documents WHERE tenant=$1")
        .bind(stage)
        .fetch_all(&mut **tx)
        .await?;
    for r in docs {
        knowledge::sync_document(
            tx,
            stage,
            &r.get::<String, _>("id"),
            r.get::<Option<String>, _>("product_id").as_deref(),
            &r.get::<String, _>("title"),
            &r.get::<String, _>("content_hash"),
        )
        .await?;
    }
    Ok(())
}
pub(super) async fn snapshot(
    tx: &mut Tx<'_>,
    tenant: &str,
    result: &mut serde_json::Map<String, Value>,
) -> Result<()> {
    let rows=sqlx::query("SELECT to_jsonb(d)-'tenant'-'revision'-'created_at' AS data FROM knowledge_documents d WHERE tenant=$1 ORDER BY id FOR UPDATE").bind(tenant).fetch_all(&mut **tx).await?;
    for row in rows {
        let data: Value = row.get("data");
        result.insert(format!("document:{}", data["id"].as_str().unwrap()), data);
    }
    Ok(())
}
pub(super) async fn publish(
    tx: &mut Tx<'_>,
    live: &str,
    stage: &str,
    id: &str,
    v: &Value,
) -> Result<()> {
    sqlx::query("INSERT INTO knowledge_documents(tenant,id,product_id,title,content_hash,content,visibility,source_type,kind,locale,translations,archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(tenant,id) DO UPDATE SET product_id=EXCLUDED.product_id,title=EXCLUDED.title,content_hash=EXCLUDED.content_hash,content=EXCLUDED.content,visibility=EXCLUDED.visibility,source_type=EXCLUDED.source_type,kind=EXCLUDED.kind,locale=EXCLUDED.locale,translations=EXCLUDED.translations,archived=EXCLUDED.archived,revision=knowledge_documents.revision+1").bind(live).bind(id).bind(v["product_id"].as_str()).bind(v["title"].as_str()).bind(v["content_hash"].as_str()).bind(v["content"].as_str()).bind(v["visibility"].as_str()).bind(v["source_type"].as_str()).bind(v["kind"].as_str()).bind(v["locale"].as_str()).bind(&v["translations"]).bind(v["archived"].as_bool().unwrap_or(false)).execute(&mut **tx).await?;
    sqlx::query("DELETE FROM knowledge_chunks WHERE tenant=$1 AND document_id=$2")
        .bind(live)
        .bind(id)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO knowledge_chunks SELECT (jsonb_populate_record(NULL::knowledge_chunks,to_jsonb(c)||jsonb_build_object('tenant',$3::text))).* FROM knowledge_chunks c WHERE tenant=$1 AND document_id=$2").bind(stage).bind(id).bind(live).execute(&mut **tx).await?;
    if let Some(product) = v["product_id"].as_str() {
        let r = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
            .bind(live)
            .bind(product)
            .fetch_one(&mut **tx)
            .await?;
        knowledge::sync_product(tx, live, &json!(crate::product(&r))).await?;
    }
    knowledge::sync_document(
        tx,
        live,
        id,
        v["product_id"].as_str(),
        v["title"].as_str().unwrap(),
        v["content_hash"].as_str().unwrap(),
    )
    .await?;
    Ok(())
}
