//! Revision-bound source detail, editing, archive/restore and publication; edits require a new public review.
use super::*;
pub(crate) async fn detail(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "knowledge.read")?;
    let v: Value = sqlx::query_scalar(
        "SELECT to_jsonb(d)-'tenant' FROM knowledge_documents d WHERE tenant=$1 AND id=$2",
    )
    .bind(t)
    .bind(id)
    .fetch_optional(&a.db)
    .await?
    .ok_or(Error(StatusCode::NOT_FOUND, "Source unavailable".into()))?;
    Ok(Json(v))
}
pub(crate) async fn edit(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    let data = content::validate(&a, &t, &v).await?;
    let rev = v["revision"].as_i64().ok_or(bad("Revision required"))?;
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,15))")
        .bind(&t)
        .execute(&mut *tx)
        .await?;
    let product = data["productId"].as_str();
    if let Some(p) = product {
        let r = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
            .bind(&t)
            .bind(p)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(bad("Unknown owning product"))?;
        knowledge::sync_product(&mut tx, &t, &json!(crate::product(&r))).await?;
    }
    let duplicate:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM knowledge_documents WHERE tenant=$1 AND id<>$2 AND product_id IS NOT DISTINCT FROM $3 AND content_hash=$4)").bind(&t).bind(&id).bind(product).bind(data["digest"].as_str()).fetch_one(&mut *tx).await?;
    if duplicate {
        return Err(conflict("Identical source already exists"));
    }
    let n=sqlx::query("UPDATE knowledge_documents SET title=$1,content=$2,content_hash=$3,product_id=$4,kind=$5,locale=$6,translations=$7,visibility='private',revision=revision+1 WHERE tenant=$8 AND id=$9 AND revision=$10 AND NOT archived")
        .bind(data["title"].as_str()).bind(data["content"].as_str()).bind(data["digest"].as_str()).bind(product).bind(data["kind"].as_str()).bind(data["locale"].as_str()).bind(&data["translations"]).bind(&t).bind(&id).bind(rev).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Source changed, archived or unavailable"));
    }
    let chunks = content::chunks(&mut tx, &t, &id, &data).await?;
    knowledge::sync_document(
        &mut tx,
        &t,
        &id,
        product,
        data["title"].as_str().unwrap(),
        data["digest"].as_str().unwrap(),
    )
    .await?;
    record(
        &mut tx,
        &t,
        &id,
        "knowledge.document.updated",
        json!({"revision":rev+1,"visibility":"private"}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"revision":rev+1,"visibility":"private","chunks":chunks,"contentHash":data["digest"]}),
    ))
}
pub(crate) async fn lifecycle(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    if v["approve"] != true {
        return Err(bad("Explicit decision required"));
    }
    let archived = v["archived"]
        .as_bool()
        .ok_or(bad("Archived must be boolean"))?;
    let rev = v["revision"].as_i64().ok_or(bad("Revision required"))?;
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    let n=sqlx::query("UPDATE knowledge_documents SET archived=$1,visibility='private',revision=revision+1 WHERE tenant=$2 AND id=$3 AND revision=$4 AND archived<>$1").bind(archived).bind(&t).bind(&id).bind(rev).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Source changed or unavailable"));
    }
    record(
        &mut tx,
        &t,
        &id,
        if archived {
            "knowledge.document.archived"
        } else {
            "knowledge.document.restored"
        },
        json!({"revision":rev+1}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"revision":rev+1,"archived":archived,"visibility":"private"}),
    ))
}
pub(super) async fn record(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    id: &str,
    kind: &str,
    data: Value,
) -> Result<()> {
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,$2,$3)")
        .bind(t)
        .bind(kind)
        .bind(json!({"documentId":id,"decision":data}))
        .execute(&mut **tx)
        .await?;
    Ok(())
}
