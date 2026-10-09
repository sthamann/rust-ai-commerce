//! Buyer-admitted initial catalog/evidence context and bounded native response revalidation; no extra truth store.
use super::*;

pub(crate) async fn graph(a: &App, h: &RequestContext, ps: &[Product]) -> Result<Value> {
    let t = tenant(h)?;
    let ids = ps.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
    let mut graph = knowledge::neighborhood(&a.db, &t, &ids).await?;
    if let Some(edges) = graph["edges"].as_array_mut() {
        edges.retain(|e| {
            ps.iter().any(|p| e["sourceId"] == p.id)
                && (e["kind"] != "PAIRS_WITH" || ps.iter().any(|p| e["targetId"] == p.id))
        });
    }
    let mut pairs = super::public_pairs(a, &t).await?;
    if let Some(pairs) = pairs.as_array_mut() {
        pairs.retain(|e| {
            ps.iter().any(|p| e["left"] == p.id) && ps.iter().any(|p| e["right"] == p.id)
        });
    }
    graph["observedPairs"] = pairs;
    graph["facts"] = json!(
        "Curated product relationships and merchant-approved observed associations; no causal effect proven"
    );
    Ok(graph)
}

/// Rehydrate only the at-most-24 original IDs; current channel/locale, native values and admitted evidence own validity.
pub(crate) async fn revalidate(
    a: &App,
    h: &RequestContext,
    ps: &[Product],
    catalog: &Value,
    prior_graph: &Value,
    locale: &str,
    chain: &[String],
) -> Result<()> {
    let changed = || conflict("Advice sources changed during inference; ask again");
    let t = tenant(h)?;
    let (current_locale, current_chain) = language_context(a, h).await?;
    if current_locale != locale || current_chain != chain {
        return Err(changed());
    }
    let ids = ps.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
    let current = super::localized_products(a, &t, chain, &ids, false).await?;
    let current = marketing::filter_channel(a, h, current)
        .await
        .map_err(|e| if e.0.is_client_error() { changed() } else { e })?
        .into_iter()
        .filter(|p| p.stock > 0)
        .collect::<Vec<_>>();
    let (settings, _) = commerce::config(a, &t).await?;
    if super::catalog_snapshot(&current, &settings.currencies.pricing_currency) != *catalog
        || graph(a, h, &current).await? != *prior_graph
    {
        return Err(changed());
    }
    Ok(())
}
