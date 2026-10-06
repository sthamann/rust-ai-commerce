//! Keep knowledge provenance and relations in the same transaction as canonical commerce data.
use super::*;
async fn edge(
    conn: &mut PgConnection,
    tenant: &str,
    kind: &str,
    left: &str,
    right: &str,
    data: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO knowledge_relations(tenant,kind,source_id,target_id,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,kind,source_id,target_id) DO UPDATE SET data=EXCLUDED.data")
        .bind(tenant).bind(kind).bind(left).bind(right).bind(data).execute(conn).await?;
    Ok(())
}
pub async fn sync_product(
    conn: &mut PgConnection,
    tenant: &str,
    product: &Value,
) -> Result<(), sqlx::Error> {
    // Preserve canonical-product locking used by order observation transactions.
    sqlx::query("SELECT id FROM products WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(tenant)
        .bind(product["id"].as_str())
        .fetch_one(conn)
        .await?;
    Ok(())
}
pub async fn seed_relations(db: &PgPool, tenant: &str) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;
    let fashion: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND id='coat' AND extra->'demo'->>'catalogVersion'='nord-atelier-v1')").bind(tenant).fetch_one(&mut *tx).await?;
    let needs = if fashion {
        vec![
            ("coat", vec!["layering", "cold-weather"]),
            ("knit", vec!["layering", "everyday"]),
            ("shirt", vec!["work", "everyday"]),
            ("trousers", vec!["work"]),
            ("dress", vec!["occasion"]),
            ("blazer", vec!["work", "layering"]),
            ("tee", vec!["everyday", "layering"]),
            ("jeans", vec!["everyday"]),
            ("skirt", vec!["everyday", "work"]),
            ("sneakers", vec!["everyday"]),
            ("bag", vec!["everyday", "work"]),
            ("scarf", vec!["layering", "cold-weather"]),
        ]
    } else {
        vec![
            ("chair", vec!["reading", "work", "small-space"]),
            ("desk", vec!["work", "small-space"]),
            ("lamp", vec!["reading", "work", "warm-light"]),
            ("mug", vec!["coffee", "reading"]),
            ("notebook", vec!["notes", "work"]),
            ("shelf", vec!["storage", "work", "small-space"]),
        ]
    };
    for (id, needs) in needs {
        for need in needs {
            edge(
                &mut tx,
                tenant,
                "SERVES",
                id,
                need,
                json!({"source":"demo-curated","confidence":1.0}),
            )
            .await?;
        }
    }
    let pairs = if fashion {
        vec![
            ("coat", "knit"),
            ("coat", "scarf"),
            ("shirt", "trousers"),
            ("blazer", "trousers"),
            ("tee", "jeans"),
            ("jeans", "sneakers"),
            ("skirt", "knit"),
            ("dress", "bag"),
        ]
    } else {
        vec![
            ("desk", "chair"),
            ("chair", "lamp"),
            ("desk", "lamp"),
            ("desk", "notebook"),
            ("desk", "shelf"),
        ]
    };
    for (left, right) in pairs {
        edge(
            &mut tx,
            tenant,
            "PAIRS_WITH",
            left,
            right,
            json!({"source":"demo-curated","confidence":1.0}),
        )
        .await?;
    }
    tx.commit().await
}
pub async fn graph(db: &PgPool, tenant: &str) -> Result<Value, sqlx::Error> {
    let needs:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('product_id',r.source_id,'need',r.target_id,'source',r.data->'source','confidence',r.data->'confidence') FROM knowledge_relations r JOIN products p ON p.tenant=r.tenant AND p.id=r.source_id WHERE r.tenant=$1 AND r.kind='SERVES' ORDER BY r.source_id,r.target_id LIMIT 48").bind(tenant).fetch_all(db).await?;
    let pairs:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('left',r.source_id,'right',r.target_id,'source',r.data->'source') FROM knowledge_relations r JOIN products p ON p.tenant=r.tenant AND p.id=r.source_id JOIN products q ON q.tenant=r.tenant AND q.id=r.target_id WHERE r.tenant=$1 AND r.kind='PAIRS_WITH' ORDER BY r.source_id,r.target_id LIMIT 48").bind(tenant).fetch_all(db).await?;
    let observed:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('left',r.source_id,'right',r.target_id,'orders',r.data->'orders','source',r.data->'source','lastEvent',r.data->'event_id') FROM knowledge_relations r JOIN products p ON p.tenant=r.tenant AND p.id=r.source_id JOIN products q ON q.tenant=r.tenant AND q.id=r.target_id WHERE r.tenant=$1 AND r.kind='CO_PURCHASED' ORDER BY (r.data->>'orders')::bigint DESC,r.source_id,r.target_id LIMIT 24").bind(tenant).fetch_all(db).await?;
    let documents:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('product_id',r.source_id,'document_id',d.id,'title',d.title,'source','merchant-document') FROM knowledge_relations r JOIN products p ON p.tenant=r.tenant AND p.id=r.source_id JOIN knowledge_documents d ON d.tenant=r.tenant AND d.id=r.target_id AND d.visibility='public' AND NOT d.archived WHERE r.tenant=$1 AND r.kind='HAS_DOCUMENT' ORDER BY r.source_id,d.id LIMIT 100").bind(tenant).fetch_all(db).await?;
    Ok(
        json!({"engine":"PostgreSQL","tenant":tenant,"needs":needs,"pairs":pairs,"observedPairs":observed,"documents":documents,"facts":"SERVES/PAIRS_WITH are curated; CO_PURCHASED are order observations with evidence, not causal claims"}),
    )
}
pub async fn sync_document(
    conn: &mut PgConnection,
    tenant: &str,
    id: &str,
    product: Option<&str>,
    _title: &str,
    _digest: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "DELETE FROM knowledge_relations WHERE tenant=$1 AND kind='HAS_DOCUMENT' AND target_id=$2",
    )
    .bind(tenant)
    .bind(id)
    .execute(&mut *conn)
    .await?;
    if let Some(product) = product {
        edge(
            conn,
            tenant,
            "HAS_DOCUMENT",
            product,
            id,
            json!({"source":"merchant-document"}),
        )
        .await?;
    }
    Ok(())
}
pub async fn sync_observation(
    conn: &mut PgConnection,
    tenant: &str,
    left: &str,
    right: &str,
    orders: i64,
    event: i64,
) -> Result<(), sqlx::Error> {
    edge(
        conn,
        tenant,
        "CO_PURCHASED",
        left,
        right,
        json!({"orders":orders,"event_id":event,"source":"order-observation"}),
    )
    .await
}
pub async fn sync_integration(
    conn: &mut PgConnection,
    tenant: &str,
    app: &str,
    id: &str,
    source: &Value,
    deleted: bool,
) -> Result<(), sqlx::Error> {
    // JSON tuple identity avoids ambiguity from separators in provider IDs.
    let key = json!([app, id]).to_string();
    sqlx::query("DELETE FROM knowledge_relations WHERE tenant=$1 AND kind='REFERENCES_PRODUCT' AND data->>'app'=$2 AND ($3='' OR data->>'sourceId'=$3)").bind(tenant).bind(app).bind(id).execute(&mut *conn).await?;
    if !deleted && let Some(ids) = source["metadata"]["productIds"].as_array() {
        for product in ids.iter().filter_map(Value::as_str).take(30) {
            edge(
                conn,
                tenant,
                "REFERENCES_PRODUCT",
                &key,
                product,
                json!({"app":app,"sourceId":id}),
            )
            .await?;
        }
    }
    Ok(())
}
