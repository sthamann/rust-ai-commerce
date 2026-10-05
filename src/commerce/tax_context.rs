//! Tax conditions consume private authoritative pre-tax cart facts without a recursive quote.
use super::*;
pub(crate) async fn tax_settings_for_cart(
    conn: &mut sqlx::PgConnection,
    c: &StoredCart,
    ps: &[Product],
    s: &Settings,
) -> Result<Settings> {
    let mut resolved = s.clone();
    if !s
        .taxes
        .iter()
        .any(|t| t.rules.iter().any(|r| r.condition.is_some()))
    {
        return Ok(resolved);
    }
    let q = quote(c, ps, s)?;
    let definitions = json!(s.taxes);
    let context = marketing::condition_context(conn, c, &q, &definitions).await?;
    for t in &mut resolved.taxes {
        let mut accepted = Vec::new();
        for mut r in t.rules.drain(..) {
            let admitted = match &r.condition {
                Some(v) => marketing::match_condition(v, c, &context)?,
                None => true,
            };
            if admitted {
                r.condition = None;
                accepted.push(r);
            }
        }
        t.rules = accepted;
    }
    Ok(resolved)
}
pub(crate) async fn tax_settings_for_header(
    a: &App,
    c: Option<&StoredCart>,
    chain: &[String],
    s: &Settings,
) -> Result<Settings> {
    if let Some(c) = c
        && s.taxes
            .iter()
            .any(|t| t.rules.iter().any(|r| r.condition.is_some()))
    {
        let ps = cart_products(a, &c.tenant, chain, &c.data.items).await?;
        return tax_settings_for_cart(&mut *a.db.acquire().await?, c, &ps, s).await;
    }
    Ok(s.clone())
}
