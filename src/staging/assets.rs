//! Binary assets are immutable, staged independently through metadata/digest units; paid entitlements never clone.
use super::*;
pub(crate) async fn snapshot_assets(
    tx: &mut Tx<'_>,
    t: &str,
    result: &mut serde_json::Map<String, Value>,
) -> Result<()> {
    let rows=sqlx::query("SELECT to_jsonb(a)-'tenant'-'content'-'created_at' AS data FROM product_assets a WHERE tenant=$1 ORDER BY id FOR UPDATE").bind(t).fetch_all(&mut **tx).await?;
    for r in rows {
        let v: Value = r.get("data");
        result.insert(format!("asset:{}", v["id"].as_str().unwrap()), v);
    }
    Ok(())
}
pub(crate) async fn publish_asset(
    tx: &mut Tx<'_>,
    live: &str,
    stage: &str,
    id: &str,
) -> Result<()> {
    sqlx::query("INSERT INTO product_assets(tenant,id,product_id,title,filename,mime,kind,public,content,digest) SELECT $1,id,product_id,title,filename,mime,kind,public,content,digest FROM product_assets WHERE tenant=$2 AND id=$3 ON CONFLICT(tenant,id) DO UPDATE SET public=EXCLUDED.public,title=EXCLUDED.title").bind(live).bind(stage).bind(id).execute(&mut **tx).await?;
    Ok(())
}
