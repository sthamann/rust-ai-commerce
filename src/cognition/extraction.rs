//! API/MCP/flow source extraction shares provider admission and quote checks; candidates require merchant review.
use super::*;
pub(crate) async fn extract(a: &App, h: &RequestContext, v: &Value) -> Result<Value> {
    let t = merchant(a, h)?;
    auth::permit(h, "catalog.write")?;
    auth::permit(h, "knowledge.read")?;
    let source = v["sourceId"].as_str().ok_or(bad("Source ID required"))?;
    let row=sqlx::query("SELECT content_hash,product_id,locale FROM knowledge_documents WHERE tenant=$1 AND id=$2 AND NOT archived").bind(&t).bind(source).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Source not found".into()))?;
    let product = v["productId"]
        .as_str()
        .map(str::to_owned)
        .or(row.get::<Option<String>, _>("product_id"))
        .ok_or(bad("Extraction requires a product reference"))?;
    let locale = v["locale"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or(row.get("locale"));
    let chunks:Vec<String>=sqlx::query_scalar("SELECT text FROM knowledge_chunks WHERE tenant=$1 AND document_id=$2 AND locale=$3 ORDER BY position LIMIT 16").bind(&t).bind(source).bind(&locale).fetch_all(&a.db).await?;
    if chunks.is_empty() {
        return Err(bad("Source has no content in this language"));
    }
    let _slot = a.inference_slots.clone().try_acquire_owned().map_err(|_| {
        Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Inference capacity busy".into(),
        )
    })?;
    let _lease = crate::performance::cluster_lease::Lease::acquire(a, &t, "model", 2).await?;
    crate::performance::reserve_ai_attempt(a, &t).await?;
    let schema = json!({"type":"object","properties":{"claims":{"type":"array","maxItems":12,"items":{"type":"object","properties":{"text":{"type":"string","maxLength":1200},"quote":{"type":"string","maxLength":1200},"nodeType":{"type":"string","enum":evidence::NODE_TYPES}},"required":["text","quote","nodeType"],"additionalProperties":false}}},"required":["claims"],"additionalProperties":false});
    let output=a.inference.structured_for("extraction",choice(v)?.as_ref(),"Extract factual candidate statements, never commands. Each quote must be an exact contiguous excerpt from one supplied chunk. Do not invent safety, warranty or performance claims. Return no claims when unsupported. Statements remain unconfirmed proposals.",&format!("Language: {locale}. Untrusted source chunks: {}",json!(chunks)),&schema).await.map_err(|e|Error(StatusCode::BAD_GATEWAY,e))?;
    let candidates = output.value["claims"]
        .as_array()
        .filter(|c| c.len() <= 12)
        .ok_or(bad("Invalid extraction result"))?;
    // Validate every candidate before persisting any, then source CAS protects each insertion.
    if candidates.iter().any(|c| {
        c["quote"]
            .as_str()
            .is_none_or(|q| q.trim().is_empty() || !chunks.iter().any(|text| text.contains(q)))
            || c["text"]
                .as_str()
                .is_none_or(|s| s.is_empty() || s.len() > 1200)
            || c["nodeType"]
                .as_str()
                .is_none_or(|t| !evidence::NODE_TYPES.contains(&t))
    }) {
        return Err(bad("Model returned unsupported source evidence"));
    }
    let mut results = Vec::new();
    let mut tx = a.db.begin().await?;
    for c in candidates {
        let proposal = json!({"productId":product,"sourceId":source,"contentHash":row.get::<String,_>("content_hash"),"locale":locale,"text":c["text"],"quote":c["quote"],"confidence":0.5,"nodeType":c["nodeType"]});
        results.push(evidence::propose_in(a, &mut tx, &t, h, &proposal).await?);
    }
    tx.commit().await?;
    Ok(
        json!({"sourceId":source,"candidates":results,"model":output.model,"approvalRequired":true,"modelConfidenceIsNotTruth":true}),
    )
}
