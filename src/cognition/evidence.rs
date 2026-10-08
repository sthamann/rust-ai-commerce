//! Source-bound claim lifecycle on the existing knowledge relation ledger; no model text becomes a confirmed fact automatically.
use super::*;
pub(crate) const NODE_TYPES: &[&str] = &[
    "product",
    "variant",
    "material",
    "property",
    "intent",
    "problem",
    "occasion",
    "audience",
    "claim",
    "return_reason",
    "supplier",
    "policy",
    "document",
    "support",
];
pub(crate) async fn claims(a: &App, t: &str, id: &str, public: bool) -> Result<Value> {
    let rows: Vec<Value> = sqlx::query_scalar(include_str!("evidence_read.sql"))
        .bind(t)
        .bind(id)
        .bind(public)
        .fetch_all(&a.db)
        .await?;
    Ok(json!({"productId":id,"claims":rows,"nodeTypes":NODE_TYPES,"modelWeightsUpdated":false}))
}
pub(crate) async fn propose(a: &App, h: &RequestContext, v: &Value) -> Result<Value> {
    let t = merchant(a, h)?;
    auth::permit(h, "catalog.write")?;
    let mut tx = a.db.begin().await?;
    let result = propose_in(a, &mut tx, &t, h, v).await?;
    tx.commit().await?;
    Ok(result)
}
pub(crate) async fn propose_in(
    a: &App,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    h: &RequestContext,
    v: &Value,
) -> Result<Value> {
    let confidence = confidence(v)?;
    let product = v["productId"].as_str().ok_or(bad("Product required"))?;
    let source = v["sourceId"].as_str().ok_or(bad("Source required"))?;
    let text = v["text"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 1200)
        .ok_or(bad("Claim must be 1..1200 bytes"))?;
    let quote = v["quote"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 2400)
        .ok_or(bad("Source quote required"))?;
    let (settings, _) = commerce::config(a, t).await?;
    let locale = v["locale"].as_str().unwrap_or(&settings.main_locale);
    if !settings.locales.iter().any(|l| l == locale) {
        return Err(bad("Claim language must be enabled"));
    }

    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND id=$2)")
            .bind(t)
            .bind(product)
            .fetch_one(&mut **tx)
            .await?;
    if !exists {
        return Err(Error(StatusCode::NOT_FOUND, "Product not found".into()));
    }
    let row=sqlx::query("SELECT content_hash,revision FROM knowledge_documents WHERE tenant=$1 AND id=$2 AND NOT archived AND (product_id IS NULL OR product_id=$3) FOR SHARE").bind(t).bind(source).bind(product).fetch_optional(&mut **tx).await?.ok_or(Error(StatusCode::NOT_FOUND,"Source not found for product".into()))?;
    if v["contentHash"] != row.get::<String, _>("content_hash") {
        return Err(conflict("Source changed; retrieve current evidence"));
    }
    let sourced:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM knowledge_chunks WHERE tenant=$1 AND document_id=$2 AND locale=$3 AND position($4 in text)>0)").bind(t).bind(source).bind(locale).bind(quote).fetch_one(&mut **tx).await?;
    if !sourced {
        return Err(bad("Quote is absent from this source/language"));
    }
    let id = uid();
    let node_type = v["nodeType"].as_str().unwrap_or("claim");
    if !NODE_TYPES.contains(&node_type) {
        return Err(bad("Unknown fact node type"));
    }
    let data = json!({"text":text,"quote":quote,"locale":locale,"sourceId":source,"sourceRevision":row.get::<i64,_>("revision"),"contentHash":v["contentHash"],"sourceType":"document","truthVerified":false,"nodeType":node_type});
    sqlx::query("INSERT INTO knowledge_relations(tenant,kind,source_id,target_id,target_kind,state,data,actor,confidence) VALUES($1,'CLAIMS',$2,$3,$7,'proposed',$4,$5,$6)").bind(t).bind(product).bind(&id).bind(data).bind(header(h,"x-rac-user").unwrap_or("integration")).bind(confidence).bind(node_type).execute(&mut **tx).await?;

    Ok(json!({"id":id,"revision":1,"state":"proposed","approvalRequired":true}))
}
/// Omitted confidence uses the documented candidate prior; malformed supplied values never become an invented score.
fn confidence(v: &Value) -> Result<f64> {
    match v.get("confidence") {
        None => Ok(0.5),
        Some(value) => value
            .as_f64()
            .filter(|n| n.is_finite() && (0.0..=1.0).contains(n))
            .ok_or(bad(
                "Claim confidence must be a finite number between 0 and 1",
            )),
    }
}
pub(crate) async fn decide(a: &App, h: &RequestContext, v: &Value) -> Result<Value> {
    let t = merchant(a, h)?;
    auth::permit(h, "catalog.write")?;
    if v["approve"] != true {
        return Err(bad("Explicit approve=true required"));
    }
    let state = v["state"]
        .as_str()
        .filter(|s| ["evidenced", "confirmed", "rejected"].contains(s))
        .ok_or(bad("Invalid evidence state"))?;
    let id = v["id"].as_str().ok_or(bad("Claim ID required"))?;
    let mut tx = a.db.begin().await?;
    let row=sqlx::query("SELECT source_id,data,revision FROM knowledge_relations WHERE tenant=$1 AND kind='CLAIMS' AND target_id=$2 FOR UPDATE").bind(&t).bind(id).fetch_optional(&mut *tx).await?.ok_or(Error(StatusCode::NOT_FOUND,"Claim not found".into()))?;
    let revision = row.get::<i64, _>("revision");
    if !verified_kernel::revision_admissible(revision as u64, v["revision"].as_u64().unwrap_or(0)) {
        return Err(conflict("Claim revision changed"));
    }
    let data: Value = row.get("data");
    let fresh:bool=sqlx::query_scalar("SELECT true FROM knowledge_documents WHERE tenant=$1 AND id=$2 AND content_hash=$3 AND revision=$4 AND NOT archived FOR SHARE").bind(&t).bind(data["sourceId"].as_str()).bind(data["contentHash"].as_str()).bind(data["sourceRevision"].as_i64()).fetch_optional(&mut *tx).await?.unwrap_or(false);
    if !fresh && state != "rejected" {
        return Err(conflict("Source changed or archived; extract again"));
    }
    sqlx::query("UPDATE knowledge_relations SET state=$1,actor=$2 WHERE tenant=$3 AND kind='CLAIMS' AND target_id=$4").bind(state).bind(header(h,"x-rac-user").unwrap_or("integration")).bind(&t).bind(id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'intelligence.claim.reviewed',$2)")
        .bind(&t)
        .bind(json!({"claimId":id,"state":state,"actor":header(h,"x-rac-user")}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(json!({"id":id,"state":state,"revision":revision+1}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn candidate_confidence_is_explicitly_validated() {
        assert_eq!(confidence(&json!({})).unwrap(), 0.5);
        for n in [0.0, 0.9, 1.0] {
            assert_eq!(confidence(&json!({"confidence":n})).unwrap(), n);
        }
        for value in [
            json!(-0.1),
            json!(1.1),
            json!("0.9"),
            json!(null),
            json!(true),
            json!({}),
            json!([]),
        ] {
            assert!(confidence(&json!({"confidence":value})).is_err());
        }
    }
}
