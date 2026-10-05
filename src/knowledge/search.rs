//! Qdrant candidates are rechecked against tenant/model/content revision in authoritative PostgreSQL.
use super::*;
pub async fn search(
    db: &PgPool,
    tenant: &str,
    query: &str,
    vector: Option<Vec<f32>>,
    model: &str,
) -> Result<Value, sqlx::Error> {
    let candidates = if let Some(vector) = vector {
        vectors::query("product", tenant, model, vector).await.ok()
    } else {
        None
    };
    let (hits, mode) = if let Some(candidates) = candidates {
        // One bounded SQL hydration preserves Qdrant rank and rechecks all authoritative scope/digests.
        let hits: Vec<Value> = sqlx::query_scalar("SELECT jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'stock',p.stock,'revision',p.revision,'score',c.hit->'score') FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS c(hit,rank) JOIN semantic_products s ON s.tenant=$1 AND s.product_id=c.hit->'payload'->>'object_id' AND s.embedding_model=$3 AND s.content_hash=c.hit->'payload'->>'digest' JOIN products p ON p.tenant=s.tenant AND p.id=s.product_id WHERE c.hit->'payload'->>'tenant'=$1 AND c.hit->'payload'->>'model'=$3 ORDER BY c.rank LIMIT 8")
            .bind(tenant).bind(json!(candidates)).bind(model).fetch_all(db).await?;
        (hits, "vector")
    } else {
        let hits:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'name',name,'price',price,'stock',stock,'revision',revision,'score',ts_rank_cd(to_tsvector('simple',name||' '||description),plainto_tsquery('simple',$2))) FROM products WHERE tenant=$1 AND to_tsvector('simple',name||' '||description) @@ plainto_tsquery('simple',$2) ORDER BY ts_rank_cd(to_tsvector('simple',name||' '||description),plainto_tsquery('simple',$2)) DESC,id LIMIT 8").bind(tenant).bind(query).fetch_all(db).await?;
        (hits, "lexical")
    };
    Ok(json!({"mode":mode,"searchEngine":"Qdrant","hits":hits,"graph":graph(db,tenant).await?}))
}
