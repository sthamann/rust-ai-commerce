//! Native currency discovery, revision-safe selection and authenticated FX/price job operations.
use super::*;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/store-api/currencies", get(discover))
        .route("/store-api/checkout/currency", axum::routing::put(select))
        .secure_route(
            "/api/merchant/currencies/rates/refresh",
            &[("POST", "catalog.write")],
            post(refresh),
        )
        .secure_route(
            "/api/merchant/currencies/price-jobs",
            &[("GET", "catalog.read"), ("POST", "catalog.write")],
            get(jobs::list).post(jobs::create),
        )
        .secure_route(
            "/api/merchant/currencies/price-jobs/{id}",
            &[("GET", "catalog.read")],
            get(jobs::detail),
        )
}
pub(super) async fn discover(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let (s, revision) =
        commerce::scoped_config(&a, &tenant(&h)?, marketing::channel_id(&h)).await?;
    let c = if header(&h, "sw-context-token").is_some() {
        Some(load_cart(&a, &h).await?)
    } else {
        None
    };
    let d = s.currencies.selected(&requested(&h, c.as_ref()))?;
    Ok(Json(
        json!({"currencyContext":context(&s.currencies,d),"availableCurrencies":s.currencies.definitions.iter().filter(|d|s.currencies.enabled.contains(&d.code)).collect::<Vec<_>>(),"defaultCurrency":s.currencies.default_currency,"baseCurrency":s.currencies.base_currency,"configuredCurrencies":s.currencies.definitions,"revision":revision,"catalogue":CODES.split(' ').map(|c|json!({"code":c,"scale":scale(c)})).collect::<Vec<_>>()}),
    ))
}
pub(super) async fn select(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let current = load_cart(&a, &h).await?;
    let (s, _) = commerce::scoped_config(&a, &current.tenant, &current.data.sales_channel).await?;
    let code = s
        .currencies
        .selected(v["currency"].as_str().ok_or(bad("Currency required"))?)?
        .code
        .clone();
    let mut c = current.clone();
    c.data.currency = code;
    if c.status != "open" || v["revision"].as_i64() != Some(c.revision) {
        return Err(conflict("Cart changed or terminal"));
    }
    c.revision += 1;
    let q = cart_json(&a, &c).await?;
    let n=sqlx::query("UPDATE carts SET data=$1,revision=$2 WHERE tenant=$3 AND token=$4 AND revision=$5 AND status='open'").bind(json!(c.data)).bind(c.revision).bind(&c.tenant).bind(&c.token).bind(current.revision).execute(&a.db).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Cart changed; reload first"));
    }
    Ok(Json(q))
}
pub(super) async fn refresh(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.write")?;
    let t = merchant(&a, &h)?;
    Ok(Json(
        rates::refresh(
            &a,
            &t,
            v["revision"].as_i64().ok_or(bad("Revision required"))?,
            &h,
        )
        .await?,
    ))
}
pub(crate) async fn guard(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    old: &Config,
    next: &Config,
) -> Result<()> {
    if old.pricing_currency != next.pricing_currency {
        return Err(conflict(
            "The original monetary storage currency cannot be relabelled",
        ));
    }
    let removed = old
        .definitions
        .iter()
        .filter(|d| !next.definitions.iter().any(|n| n.code == d.code))
        .map(|d| d.code.clone())
        .collect::<Vec<_>>();
    let used:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND ((extra->'currencyPrices') ?| $2 OR extra->>'priceCurrency'=ANY($2))) OR EXISTS(SELECT 1 FROM currency_price_jobs WHERE tenant=$1 AND state='queued' AND data->>'currency'=ANY($2)) OR EXISTS(SELECT 1 FROM carts WHERE tenant=$1 AND status='open' AND data->>'currency'=ANY($2))").bind(t).bind(removed).fetch_one(&mut **tx).await?;
    if used {
        return Err(conflict(
            "Currency is referenced by product prices or open carts; remove channel availability instead",
        ));
    }
    Ok(())
}
