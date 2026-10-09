//! Price-only optional autonomy, atomic unique-SKU daily quotas and a non-compounding day baseline.
use super::*;
pub(crate) async fn reserve(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    id: &str,
    h: &RequestContext,
    s: &commerce::Settings,
    p: &Proposal,
    products: &[Product],
) -> Result<()> {
    auth::permit(h, "catalog.write")?;
    auth::permit(h, "settings.write")?;
    let used:i64=sqlx::query_scalar("SELECT count(*) FROM ai_price_budget WHERE tenant=$1 AND day=(now() AT TIME ZONE 'UTC')::date").bind(t).fetch_one(&mut **tx).await?;
    let existing:Vec<String>=sqlx::query_scalar("SELECT product_id FROM ai_price_budget WHERE tenant=$1 AND day=(now() AT TIME ZONE 'UTC')::date").bind(t).fetch_all(&mut **tx).await?;
    let added = p
        .changes
        .iter()
        .filter(|c| !existing.contains(&c.product_id))
        .count();
    if !verified_kernel::ai_autonomy_admissible(
        s.ai_policy.autonomy.enabled,
        auth::allowed(h, "catalog.write") && auth::allowed(h, "settings.write"),
        p.app_action.is_none()
            && p.experience.is_none()
            && !p.changes.is_empty()
            && p.changes
                .iter()
                .all(|c| c.stock.is_none() && c.price.is_some()),
        used as usize + added <= s.ai_policy.autonomy.products_per_day as usize,
        true,
    ) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Autonomy is disabled, out of scope or exceeds today's unique-product budget".into(),
        ));
    }
    for c in &p.changes {
        let product = products
            .iter()
            .find(|p| p.id == c.product_id)
            .ok_or(bad("Product unavailable"))?;
        guardrails::check(s, product, c, true)?;
        let code = product.extra["priceCurrency"]
            .as_str()
            .unwrap_or(&s.currencies.pricing_currency);
        let scale = s
            .currencies
            .definitions
            .iter()
            .find(|d| d.code == code)
            .ok_or(bad("Currency missing"))?
            .scale;
        let first:i64=sqlx::query_scalar("INSERT INTO ai_price_budget(tenant,day,product_id,baseline_minor,currency,task_id,actor) VALUES($1,(now() AT TIME ZONE 'UTC')::date,$2,$3,$4,$5,$6) ON CONFLICT(tenant,day,product_id) DO UPDATE SET task_id=EXCLUDED.task_id RETURNING baseline_minor")
            .bind(t).bind(&product.id).bind(currencies::amount(product.price,code,scale)?.minor()).bind(code).bind(id).bind(header(h,"x-rac-user").unwrap_or("integration")).fetch_one(&mut **tx).await?;
        let proposed = currencies::amount(c.price.unwrap(), code, scale)?.minor();
        let baseline_currency:String=sqlx::query_scalar("SELECT currency FROM ai_price_budget WHERE tenant=$1 AND day=(now() AT TIME ZONE 'UTC')::date AND product_id=$2").bind(t).bind(&product.id).fetch_one(&mut **tx).await?;
        if code != baseline_currency
            || (first.abs_diff(proposed) as u128) * 10000
                > first as u128 * u128::from(s.ai_policy.autonomy.max_change_bps)
        {
            return Err(conflict(
                "Autonomy cannot compound beyond today's original price/currency budget",
            ));
        }
    }
    Ok(())
}
