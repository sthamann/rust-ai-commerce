//! Apache AGE graph plus pgvector retrieval. Queries are fixed, parameters are data.
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool, Row};

struct GraphParams(String);
impl sqlx::Type<sqlx::Postgres> for GraphParams {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        sqlx::postgres::PgTypeInfo::with_name("ag_catalog.agtype")
    }
}
impl sqlx::Encode<'_, sqlx::Postgres> for GraphParams {
    fn encode_by_ref(
        &self,
        buf: &mut sqlx::postgres::PgArgumentBuffer,
    ) -> Result<sqlx::encode::IsNull, sqlx::error::BoxDynError> {
        // AGE's agtype_recv protocol: version byte 1 followed by JSON text.
        buf.push(1);
        buf.extend_from_slice(self.0.as_bytes());
        Ok(sqlx::encode::IsNull::No)
    }
}

pub async fn cypher(
    db: &PgPool,
    query: &'static str,
    params: Value,
) -> Result<Vec<Value>, sqlx::Error> {
    // The query comes exclusively from code below, never from a client or LLM.
    let sql = format!(
        "SELECT result::text AS result FROM ag_catalog.cypher('commerce', $graph${query}$graph$, $1) AS (result ag_catalog.agtype)"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(GraphParams(params.to_string()))
        .fetch_all(db)
        .await?;
    Ok(rows
        .iter()
        .map(|r| serde_json::from_str(&r.get::<String, _>("result")).unwrap_or(Value::Null))
        .collect())
}
pub async fn sync_product(
    conn: &mut PgConnection,
    tenant: &str,
    product: &Value,
) -> Result<(), sqlx::Error> {
    let sql = "SELECT result::text FROM ag_catalog.cypher('commerce', $graph$MERGE (p:Product {tenant: $tenant, product_id: $id}) SET p.name=$name, p.category=$category, p.description=$description, p.revision=$revision RETURN p.product_id$graph$, $1) AS (result ag_catalog.agtype)";
    sqlx::query(sql).bind(GraphParams(json!({"tenant":tenant,"id":product["id"],"name":product["name"],"category":product["category"],"description":product["description"],"revision":product["revision"]}).to_string())).execute(conn).await?;
    Ok(())
}
pub async fn seed_relations(db: &PgPool, tenant: &str) -> Result<(), sqlx::Error> {
    for (id, needs) in [
        ("chair", vec!["reading", "work", "small-space"]),
        ("desk", vec!["work", "small-space"]),
        ("lamp", vec!["reading", "work", "warm-light"]),
        ("mug", vec!["coffee", "reading"]),
        ("notebook", vec!["notes", "work"]),
        ("shelf", vec!["storage", "work", "small-space"]),
    ] {
        for need in needs {
            cypher(db,"MATCH (p:Product {tenant:$tenant, product_id:$id}) MERGE (n:Need {tenant:$tenant, name:$need}) MERGE (p)-[r:SERVES]->(n) SET r.source='demo-curated', r.confidence=1.0 RETURN n.name",json!({"tenant":tenant,"id":id,"need":need})).await?;
        }
    }
    for (left, right) in [
        ("desk", "chair"),
        ("chair", "lamp"),
        ("desk", "lamp"),
        ("desk", "notebook"),
        ("desk", "shelf"),
    ] {
        cypher(db,"MATCH (a:Product {tenant:$tenant, product_id:$left}), (b:Product {tenant:$tenant, product_id:$right}) MERGE (a)-[r:PAIRS_WITH]->(b) SET r.source='demo-curated', r.confidence=1.0 RETURN b.product_id",json!({"tenant":tenant,"left":left,"right":right})).await?;
    }
    Ok(())
}
pub async fn graph(db: &PgPool, tenant: &str) -> Result<Value, sqlx::Error> {
    let needs=cypher(db,"MATCH (p:Product {tenant:$tenant})-[r:SERVES]->(n:Need {tenant:$tenant}) RETURN {product_id:p.product_id, need:n.name, source:r.source, confidence:r.confidence} LIMIT 48",json!({"tenant":tenant})).await?;
    let pairs=cypher(db,"MATCH (a:Product {tenant:$tenant})-[r:PAIRS_WITH]->(b:Product {tenant:$tenant}) RETURN {left:a.product_id, right:b.product_id, source:r.source} LIMIT 48",json!({"tenant":tenant})).await?;
    let observed=cypher(db,"MATCH (a:Product {tenant:$tenant})-[r:CO_PURCHASED]->(b:Product {tenant:$tenant}) RETURN {left:a.product_id,right:b.product_id,orders:r.orders,source:r.source,lastEvent:r.event_id} ORDER BY r.orders DESC LIMIT 24",json!({"tenant":tenant})).await?;
    let documents=cypher(db,"MATCH (p:Product {tenant:$tenant})-[:HAS_DOCUMENT]->(d:Document {tenant:$tenant}) RETURN {product_id:p.product_id,document_id:d.document_id,title:d.title,source:d.source} LIMIT 100",json!({"tenant":tenant})).await?;
    let published: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM knowledge_documents WHERE tenant=$1 AND visibility='public'",
    )
    .bind(tenant)
    .fetch_all(db)
    .await?;
    let documents = documents
        .into_iter()
        .filter(|d| {
            d["document_id"]
                .as_str()
                .is_some_and(|id| published.iter().any(|p| p == id))
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"documents":documents,"engine":"Apache AGE","tenant":tenant,"needs":needs,"pairs":pairs,"observedPairs":observed,"facts":"SERVES/PAIRS_WITH are curated; CO_PURCHASED are order observations with evidence, not causal claims"}),
    )
}
pub async fn embedding(
    http: &reqwest::Client,
    url: &str,
    model: &str,
    text: &str,
) -> Result<Vec<f32>, String> {
    let response = http
        .post(format!("{}/api/embed", url.trim_end_matches('/')))
        .json(&json!({"model":model,"input":text,"truncate":false}))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| "Embedding service unavailable")?;
    if !response.status().is_success() {
        return Err("Embedding service rejected request".into());
    }
    let raw: Value = response
        .json()
        .await
        .map_err(|_| "Invalid embedding response")?;
    let vector: Vec<f32> = serde_json::from_value(raw["embeddings"][0].clone())
        .map_err(|_| "Invalid embedding vector")?;
    if vector.len() != 1024 || vector.iter().any(|v| !v.is_finite()) {
        return Err("Embedding model must return 1024 finite dimensions".into());
    }
    Ok(vector)
}
pub async fn search(
    db: &PgPool,
    tenant: &str,
    query: &str,
    vector: Option<Vec<f32>>,
    model: &str,
) -> Result<Value, sqlx::Error> {
    // Tenant filter is enforced before exact vector ranking. Small prototype uses
    // exact search; production ANN needs tenant partitions and measured recall.
    let (rows, mode) = if let Some(vector) = vector {
        let literal = serde_json::to_string(&vector).unwrap();
        (sqlx::query("SELECT p.id,p.name,p.price,p.stock,p.revision,1-(s.embedding <=> $3::text::vector) AS score FROM semantic_products s JOIN products p ON p.tenant=s.tenant AND p.id=s.product_id WHERE s.tenant=$1 AND s.embedding_model=$2 ORDER BY s.embedding <=> $3::text::vector LIMIT 8").bind(tenant).bind(model).bind(literal).fetch_all(db).await?,"vector")
    } else {
        (sqlx::query("SELECT id,name,price,stock,revision,ts_rank_cd(to_tsvector('simple',name||' '||description),plainto_tsquery('simple',$2))::double precision AS score FROM products WHERE tenant=$1 AND to_tsvector('simple',name||' '||description) @@ plainto_tsquery('simple',$2) ORDER BY score DESC LIMIT 8").bind(tenant).bind(query).fetch_all(db).await?,"lexical")
    };
    let hits=rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"price":r.get::<f64,_>("price"),"stock":r.get::<i32,_>("stock"),"revision":r.get::<i64,_>("revision"),"score":r.get::<f64,_>("score")})).collect::<Vec<_>>();
    Ok(json!({"mode":mode,"hits":hits,"graph":graph(db,tenant).await?}))
}

/// Persist source provenance as an actual AGE document node and product relation.
pub async fn sync_document(
    conn: &mut PgConnection,
    tenant: &str,
    id: &str,
    product: Option<&str>,
    title: &str,
    digest: &str,
) -> Result<(), sqlx::Error> {
    let params = GraphParams(
        json!({"tenant":tenant,"id":id,"product":product,"title":title,"hash":digest}).to_string(),
    );
    sqlx::query("SELECT result::text FROM ag_catalog.cypher('commerce', $graph$MERGE (d:Document {tenant:$tenant,document_id:$id}) SET d.title=$title,d.content_hash=$hash,d.source='merchant-document' RETURN d.document_id$graph$, $1) AS (result ag_catalog.agtype)").bind(params).execute(&mut *conn).await?;
    if product.is_some() {
        sqlx::query("SELECT result::text FROM ag_catalog.cypher('commerce', $graph$MATCH (p:Product {tenant:$tenant,product_id:$product}),(d:Document {tenant:$tenant,document_id:$id}) MERGE (p)-[:HAS_DOCUMENT]->(d) RETURN d.document_id$graph$, $1) AS (result ag_catalog.agtype)").bind(GraphParams(json!({"tenant":tenant,"id":id,"product":product}).to_string())).execute(conn).await?;
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
    let sql = "SELECT result::text FROM ag_catalog.cypher('commerce', $graph$MATCH (a:Product {tenant:$tenant,product_id:$left}),(b:Product {tenant:$tenant,product_id:$right}) MERGE (a)-[r:CO_PURCHASED]->(b) SET r.orders=$orders,r.event_id=$event,r.source='order-observation' RETURN r.orders$graph$, $1) AS (result ag_catalog.agtype)";
    sqlx::query(sql)
        .bind(GraphParams(
            json!({"tenant":tenant,"left":left,"right":right,"orders":orders,"event":event})
                .to_string(),
        ))
        .execute(conn)
        .await?;
    Ok(())
}

/// Private app source provenance; storefront graph queries never expose these nodes.
pub async fn sync_integration(
    conn: &mut PgConnection,
    tenant: &str,
    app: &str,
    id: &str,
    source: &Value,
    deleted: bool,
) -> Result<(), sqlx::Error> {
    let params=GraphParams(json!({"tenant":tenant,"app":app,"id":id,"title":source["title"],"kind":source["kind"],"order":source["metadata"]["orderNumber"]}).to_string());
    let query = if deleted {
        if id.is_empty() {
            "MATCH (e:AppEvidence {tenant:$tenant,app:$app}) DETACH DELETE e RETURN 1"
        } else {
            "MATCH (e:AppEvidence {tenant:$tenant,app:$app,source_id:$id}) DETACH DELETE e RETURN 1"
        }
    } else {
        "MERGE (s:Shop {tenant:$tenant}) MERGE (e:AppEvidence {tenant:$tenant,app:$app,source_id:$id}) SET e.title=$title,e.kind=$kind,e.private=true MERGE (s)-[:HAS_PRIVATE_SOURCE]->(e) RETURN e.source_id"
    };
    let sql = format!(
        "SELECT result::text FROM ag_catalog.cypher('commerce',$graph${query}$graph$,$1) AS (result ag_catalog.agtype)"
    );
    sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(params)
        .execute(&mut *conn)
        .await?;
    if !deleted {
        let ids = source["metadata"]["productIds"]
            .as_array()
            .map(|xs| {
                xs.iter()
                    .filter_map(Value::as_str)
                    .take(30)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let params =
            GraphParams(json!({"tenant":tenant,"app":app,"id":id,"products":ids}).to_string());
        sqlx::query("SELECT result::text FROM ag_catalog.cypher('commerce',$graph$MATCH (e:AppEvidence {tenant:$tenant,app:$app,source_id:$id})-[r:REFERENCES_PRODUCT]->() DELETE r RETURN 1$graph$,$1) AS (result ag_catalog.agtype)").bind(params).execute(&mut *conn).await?;
        let params =
            GraphParams(json!({"tenant":tenant,"app":app,"id":id,"products":ids}).to_string());
        sqlx::query("SELECT result::text FROM ag_catalog.cypher('commerce',$graph$MATCH (e:AppEvidence {tenant:$tenant,app:$app,source_id:$id}), (p:Product {tenant:$tenant}) WHERE p.product_id IN $products MERGE (e)-[:REFERENCES_PRODUCT]->(p) RETURN p.product_id$graph$,$1) AS (result ag_catalog.agtype)").bind(params).execute(conn).await?;
    }
    Ok(())
}
