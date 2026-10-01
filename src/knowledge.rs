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
    let needs=cypher(db,"MATCH (p:Product {tenant:$tenant})-[r:SERVES]->(n:Need {tenant:$tenant}) RETURN {product_id:p.product_id, need:n.name, source:r.source, confidence:r.confidence}",json!({"tenant":tenant})).await?;
    let pairs=cypher(db,"MATCH (a:Product {tenant:$tenant})-[r:PAIRS_WITH]->(b:Product {tenant:$tenant}) RETURN {left:a.product_id, right:b.product_id, source:r.source}",json!({"tenant":tenant})).await?;
    Ok(
        json!({"engine":"Apache AGE","tenant":tenant,"needs":needs,"pairs":pairs,"facts":"curated demo relations; not learned or inferred facts"}),
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
