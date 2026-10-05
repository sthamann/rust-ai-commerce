//! Per-product channel visibility overrides remain indexed even when an open catalog contains millions of products.
use super::*;
pub(crate) async fn save_product_channels(
    tx: &mut sqlx::PgConnection,
    t: &str,
    id: &str,
    ids: &[String],
) -> Result<()> {
    if ids.len() > 100 {
        return Err(bad("Maximum 100 product channels"));
    }
    let channels: Vec<String> =
        sqlx::query_scalar("SELECT id FROM sales_channels WHERE tenant=$1 ORDER BY id FOR UPDATE")
            .bind(t)
            .fetch_all(&mut *tx)
            .await?;
    if ids.iter().any(|id| !channels.contains(id)) {
        return Err(bad("Unknown product sales channel"));
    }
    for channel in channels {
        sqlx::query("INSERT INTO product_channel_visibility VALUES($1,$2,$3,$4) ON CONFLICT(tenant,product_id,channel_id) DO UPDATE SET visible=EXCLUDED.visible").bind(t).bind(id).bind(&channel).bind(ids.contains(&channel)).execute(&mut *tx).await?;
    }
    Ok(())
}
pub(crate) async fn product_channels(a: &App, t: &str, id: &str) -> Result<Value> {
    let rows=sqlx::query("SELECT c.id,c.data,coalesce(v.visible,true) AS visible FROM sales_channels c LEFT JOIN product_channel_visibility v ON v.tenant=c.tenant AND v.channel_id=c.id AND v.product_id=$2 WHERE c.tenant=$1 ORDER BY c.id LIMIT 101").bind(t).bind(id).fetch_all(&a.db).await?;
    if rows.len() > 100 {
        return Err(bad(
            "Interactive product editor supports at most 100 channels",
        ));
    }
    Ok(json!(rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"data":r.get::<Value,_>("data"),"visible":r.get::<bool,_>("visible")})).collect::<Vec<_>>()))
}
