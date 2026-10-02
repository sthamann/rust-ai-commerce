//! Sales channels share a merchant tenant but bind independent catalog visibility, locale and cart identity.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Channel {
    pub name: HashMap<String, String>,
    pub kind: String,
    pub active: bool,
    pub locales: Vec<String>,
    pub product_ids: Vec<String>,
}
pub(crate) async fn channel(a: &App, t: &str, id: &str, locale: &str) -> Result<Option<Channel>> {
    if id == "default" {
        return Ok(None);
    }
    let data: Value =
        sqlx::query_scalar("SELECT data FROM sales_channels WHERE tenant=$1 AND id=$2")
            .bind(t)
            .bind(id)
            .fetch_optional(&a.db)
            .await?
            .ok_or(Error(
                StatusCode::NOT_FOUND,
                "Sales channel unavailable".into(),
            ))?;
    let c: Channel = serde_json::from_value(data).map_err(|_| bad("Invalid channel"))?;
    if !c.active || !c.locales.contains(&locale.to_string()) {
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
    if let Some(c) = channel(
        a,
        &tenant(h)?,
        channel_id(h),
        &language_context(a, h).await?.0,
    )
    .await?
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
    let config = channel(
        a,
        &tenant(h)?,
        channel_id(h),
        &language_context(a, h).await?.0,
    )
    .await?;
    Ok(ps
        .into_iter()
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
    Ok(channel(
        a,
        &tenant(h)?,
        channel_id(h),
        &language_context(a, h).await?.0,
    )
    .await?
    .and_then(|c| (!c.product_ids.is_empty()).then_some(c.product_ids)))
}
