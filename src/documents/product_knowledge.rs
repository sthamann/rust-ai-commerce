//! Product-centred canonical facts and tenant-filtered graph evidence, independent of the overview's truncated sample.
use super::*;
pub(crate) async fn product_knowledge(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "knowledge.read")?;
    let row = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
        .bind(&t)
        .bind(&id)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Product unavailable".into()))?;
    let (locale, chain) = language_context(&a, &h).await?;
    let product = localize_products(&a, &t, &chain, vec![crate::product(&row)])
        .await?
        .remove(0);
    let needs:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('need',target_id,'source',data->'source','confidence',data->'confidence') FROM knowledge_relations WHERE tenant=$1 AND kind='SERVES' AND source_id=$2 ORDER BY target_id LIMIT 50").bind(&t).bind(&id).fetch_all(&a.db).await?;
    let complements:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',p.id,'name',p.name,'source',r.data->'source') FROM knowledge_relations r JOIN products p ON p.tenant=r.tenant AND p.id=CASE WHEN r.source_id=$2 THEN r.target_id ELSE r.source_id END WHERE r.tenant=$1 AND r.kind='PAIRS_WITH' AND (r.source_id=$2 OR r.target_id=$2) ORDER BY p.id LIMIT 50").bind(&t).bind(&id).fetch_all(&a.db).await?;
    let observed:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',CASE WHEN left_id=$2 THEN right_id ELSE left_id END,'orders',orders,'lastEvent',last_event,'source','order-observation') FROM observed_pairs WHERE tenant=$1 AND (left_id=$2 OR right_id=$2) ORDER BY orders DESC LIMIT 50").bind(&t).bind(&id).fetch_all(&a.db).await?;
    let (settings, _) = commerce::config(&a, &t).await?;
    let sources:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'title',COALESCE(translations->$4->>'title',translations->$5->>'title',title),'kind',kind,'visibility',visibility,'productId',product_id) FROM knowledge_documents WHERE tenant=$1 AND NOT archived AND (product_id=$2 OR product_id IS NULL OR product_id=$3) ORDER BY id LIMIT 50").bind(&t).bind(&id).bind(row.get::<Option<String>,_>("parent_id")).bind(&locale).bind(&settings.main_locale).fetch_all(&a.db).await?;
    let stats:Value=sqlx::query_scalar("SELECT jsonb_build_object('variants',(SELECT count(*) FROM products WHERE tenant=$1 AND parent_id=$2),'reviews',(SELECT count(*) FROM product_reviews WHERE tenant=$1 AND product_id=$2 AND approved),'averageRating',(SELECT coalesce(avg(rating),0) FROM product_reviews WHERE tenant=$1 AND product_id=$2 AND approved))").bind(&t).bind(&id).fetch_one(&a.db).await?;
    let external = apps::private_graph(&a, &t).await?;
    let refs = external["products"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|p| p["productId"] == id)
        .cloned()
        .collect::<Vec<_>>();
    Ok(Json(
        json!({"product":product,"stats":stats,"needs":needs,"complements":complements,"observed":observed,"sources":sources,"external":refs,"limit":50,"catalogueDerived":true}),
    ))
}
