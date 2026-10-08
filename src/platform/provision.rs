//! Operator shop creation commits ownership, settings and audit atomically; never issues another user's credentials.
use super::*;
pub(super) async fn create(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let actor = auth::actor(&h)?;
    let id = v["id"].as_str().ok_or(bad("Shop ID required"))?;
    validate_tenant(id)?;
    if ["app", "www", "api", "admin", "mail", "platform"].contains(&id) {
        return Err(bad("Reserved shop ID"));
    }
    let name = v["name"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 100)
        .ok_or(bad("Shop name required"))?;
    let seed = v["seedCatalog"].as_bool().unwrap_or(false);
    let owner = if v["ownerEmail"]
        .as_str()
        .is_some_and(|s| !s.trim().is_empty())
    {
        sqlx::query_scalar::<_, String>("SELECT id FROM merchant_users WHERE email=$1")
            .bind(crate::auth::email(&json!({"email":v["ownerEmail"]}))?)
            .fetch_optional(&a.db)
            .await?
            .ok_or(bad("Owner must have an existing personal merchant account"))?
    } else {
        actor.to_string()
    };
    let mut tx = a.db.begin().await?;
    let sandbox =
        crate::auth::provision_shop(&mut tx, &owner, id, name.trim(), String::new(), seed, false)
            .await?;
    sqlx::query(
        "INSERT INTO platform_audit(actor,action,tenant,data) VALUES($1,'shop.created',$2,$3)",
    )
    .bind(actor)
    .bind(id)
    .bind(json!({"owner":owner,"seedCatalog":seed}))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    a.sandboxes.insert(id.into(), Arc::new(sandbox));
    // Product indexing uses the regular consumer and reports failure independently; committed shop ownership stays valid.
    let indexed = if seed {
        let result: Result<()> = async {
            for p in prototype_products(&a, id).await? {
                knowledge::sync_product_scoped(&a.db, id, &json!(p)).await?;
            }
            knowledge::seed_relations(&a.db, id).await?;
            Ok(())
        }
        .await;
        result.is_ok()
    } else {
        true
    };
    Ok(Json(
        json!({"id":id,"name":name.trim(),"ownerId":owner,"seedCatalog":seed,"knowledgeIndexed":indexed,"paymentMode":"simulated","urls":crate::shop_domains::links(id),"storefrontPath":format!("/?shop={id}"),"studioPath":format!("/?shop={id}#merchant")}),
    ))
}
