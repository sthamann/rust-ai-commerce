//! Sales channels share a merchant tenant but bind independent catalog visibility, locale and cart identity.
use super::*;
use std::collections::HashSet;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Channel {
    pub name: HashMap<String, String>,
    pub kind: String,
    pub active: bool,
    #[serde(default = "public_visibility")]
    pub visibility: String,
    pub locales: Vec<String>,
    pub product_ids: Vec<String>,
    #[serde(default)]
    pub navigation_category_id: Option<String>,
}
fn public_visibility() -> String {
    "public".into()
}
pub(crate) async fn channel(
    a: &App,
    h: &HeaderMap,
    id: &str,
    locale: &str,
) -> Result<Option<Channel>> {
    let t = tenant(h)?;
    let data: Value =
        sqlx::query_scalar("SELECT data FROM sales_channels WHERE tenant=$1 AND id=$2")
            .bind(&t)
            .bind(id)
            .fetch_optional(&a.db)
            .await?
            .ok_or(Error(
                StatusCode::NOT_FOUND,
                "Sales channel unavailable".into(),
            ))?;
    let mut c: Channel = serde_json::from_value(data).map_err(|_| bad("Invalid channel"))?;
    // The main channel inherits shop languages; additional channels select a subset.
    if id == "default" {
        c.locales = commerce::config(a, &t).await?.0.locales;
    }
    let allowed = c.locales.contains(&locale.to_string())
        || (id == "default"
            && c.locales
                .iter()
                .any(|enabled| enabled.split('-').next() == locale.split('-').next()));
    if (!c.active && header(h, "x-rac-channel-preview") != Some(id)) || !allowed {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Sales channel or language unavailable".into(),
        ));
    }
    Ok(Some(c))
}
pub(crate) fn channel_id(h: &HeaderMap) -> &str {
    header(h, "sw-sales-channel-id").unwrap_or("default")
}
pub(crate) async fn admit_product(a: &App, h: &HeaderMap, id: &str) -> Result<()> {
    let available:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products p WHERE p.tenant=$1 AND p.id=$2 AND p.active AND (p.parent_id IS NULL OR EXISTS(SELECT 1 FROM products parent WHERE parent.tenant=p.tenant AND parent.id=p.parent_id AND parent.active)))").bind(tenant(h)?).bind(id).fetch_one(&a.db).await?;
    if !available {
        return Err(Error(StatusCode::NOT_FOUND, "Product unavailable".into()));
    }
    let hidden:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product_channel_visibility v WHERE v.tenant=$1 AND v.channel_id=$2 AND NOT v.visible AND (v.product_id=$3 OR v.product_id=(SELECT parent_id FROM products WHERE tenant=$1 AND id=$3)))").bind(tenant(h)?).bind(channel_id(h)).bind(id).fetch_one(&a.db).await?;
    if hidden {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Product hidden in this sales channel".into(),
        ));
    }
    if let Some(c) = channel(a, h, channel_id(h), &language_context(a, h).await?.0).await?
        && !c.product_ids.is_empty()
        && !c.product_ids.iter().any(|p| p == id)
    {
        let parent: Option<String> =
            sqlx::query_scalar("SELECT parent_id FROM products WHERE tenant=$1 AND id=$2")
                .bind(tenant(h)?)
                .bind(id)
                .fetch_optional(&a.db)
                .await?
                .flatten();
        if !parent.is_some_and(|p| c.product_ids.contains(&p)) {
            return Err(Error(
                StatusCode::NOT_FOUND,
                "Product not visible in sales channel".into(),
            ));
        }
    }
    Ok(())
}
pub(crate) async fn filter_channel(
    a: &App,
    h: &HeaderMap,
    ps: Vec<Product>,
) -> Result<Vec<Product>> {
    let config = channel(a, h, channel_id(h), &language_context(a, h).await?.0).await?;
    let ids = ps.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
    let admitted: Vec<String> = sqlx::query_scalar("SELECT p.id FROM products p WHERE p.tenant=$1 AND p.id=ANY($2) AND p.active AND (p.parent_id IS NULL OR EXISTS(SELECT 1 FROM products parent WHERE parent.tenant=p.tenant AND parent.id=p.parent_id AND parent.active)) AND NOT EXISTS(SELECT 1 FROM product_channel_visibility v WHERE v.tenant=p.tenant AND v.channel_id=$3 AND NOT v.visible AND (v.product_id=p.id OR v.product_id=p.parent_id))")
        .bind(tenant(h)?).bind(ids).bind(channel_id(h)).fetch_all(&a.db).await?;
    let admitted = admitted.into_iter().collect::<HashSet<_>>();
    Ok(ps
        .into_iter()
        .filter(|p| admitted.contains(&p.id))
        .filter(|p| {
            config.as_ref().is_none_or(|c| {
                c.product_ids.is_empty()
                    || c.product_ids.contains(&p.id)
                    || p.parent_id
                        .as_ref()
                        .is_some_and(|id| c.product_ids.contains(id))
            })
        })
        .collect())
}

/// Internal scope is never taken from caller-supplied catalog criteria.
pub(crate) async fn catalog_scope(a: &App, h: &HeaderMap) -> Result<Option<Vec<String>>> {
    Ok(
        channel(a, h, channel_id(h), &language_context(a, h).await?.0)
            .await?
            .and_then(|c| (!c.product_ids.is_empty()).then_some(c.product_ids)),
    )
}
