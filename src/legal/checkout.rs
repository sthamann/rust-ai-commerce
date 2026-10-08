//! Explicit document/digital acknowledgement and immutable order policy snapshots; transport-neutral checkout guard.
use super::*;
use model::version;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Acceptance {
    policy_version: String,
    terms: bool,
    digital_immediate: bool,
}
pub(super) async fn accept(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Acceptance>,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let mut tx = a.db.begin().await?;
    let (s, _) = commerce::scoped_locked(&mut tx, &c.tenant, &c.data.sales_channel).await?;
    if v.policy_version != version(&s.legal) {
        return Err(conflict("Legal documents changed; review again"));
    }
    let data = json!({"policyVersion":v.policy_version,"terms":v.terms,"digitalImmediate":v.digital_immediate,"locale":c.data.locale,"recordedAt":chrono::Utc::now().to_rfc3339()});
    sqlx::query("INSERT INTO legal_acceptances(tenant,cart_id,data) VALUES($1,$2,$3) ON CONFLICT(tenant,cart_id) DO UPDATE SET data=EXCLUDED.data")
      .bind(&c.tenant).bind(&c.id).bind(&data).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(data))
}
pub(crate) async fn snapshot(
    tx: &mut sqlx::PgConnection,
    c: &StoredCart,
    s: &commerce::Settings,
    products: &[Product],
) -> Result<Value> {
    let acceptance: Value = sqlx::query_scalar(
        "SELECT data FROM legal_acceptances WHERE tenant=$1 AND cart_id=$2 FOR SHARE",
    )
    .bind(&c.tenant)
    .bind(&c.id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or(json!({}));
    let consumer = !s.is_business(&c.data.group);
    let digital = consumer && products.iter().any(|p| p.extra["digital"] == true);
    if !verified_kernel::legal_checkout_admissible(
        s.legal.strict_checkout,
        acceptance["policyVersion"] == version(&s.legal),
        acceptance["terms"] == true,
        digital,
        acceptance["digitalImmediate"] == true,
    ) {
        return Err(bad("Current legal acknowledgement required"));
    }
    if s.legal.strict_checkout {
        for key in ["privacy", "terms", "shipping"]
            .into_iter()
            .chain(consumer.then_some("withdrawal"))
        {
            if commerce::translated_string(
                &json!(s.legal.documents.get(key)),
                &c.data.locale,
                &s.main_locale,
            )
            .trim()
            .is_empty()
            {
                return Err(bad("Required legal document missing"));
            }
        }
        let gaps = products
            .iter()
            .flat_map(|p| product_gaps(&p.extra, &s.legal, &c.data.locale, &s.main_locale))
            .collect::<Vec<_>>();
        if !gaps.is_empty() {
            return Err(bad(format!(
                "Product compliance information missing: {}",
                gaps.join(", ")
            )));
        }
    }
    Ok(
        json!({"policyVersion":version(&s.legal),"documents":s.legal.documents,"acceptance":acceptance,"strictCheckout":s.legal.strict_checkout,"salesChannelId":c.data.sales_channel}),
    )
}
