//! Server-authoritative coupons and automatic campaigns, with deterministic discounts and atomic usage limits.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Promotion {
    pub name: HashMap<String, String>,
    pub active: bool,
    pub code: Option<String>,
    pub kind: String,
    pub amount: f64,
    pub rule: rules::Condition,
    pub exclusive: bool,
    pub priority: i32,
    pub max_uses: Option<i64>,
    pub start: Option<String>,
    pub end: Option<String>,
}
pub(crate) fn validate_promotion(p: &Promotion) -> Result<()> {
    p.rule.validate(0)?;
    if !["percentage", "absolute", "free_shipping"].contains(&p.kind.as_str())
        || !p.amount.is_finite()
        || p.amount < 0.
        || p.amount > 1_000_000.
        || (p.kind == "percentage" && p.amount > 100.)
        || p.code
            .as_ref()
            .is_some_and(|c| c.is_empty() || c.len() > 64 || !c.is_ascii())
        || p.max_uses.is_some_and(|n| n < 1)
    {
        return Err(bad("Invalid promotion"));
    }
    Ok(())
}
pub(crate) async fn promote(
    tx: &mut sqlx::PgConnection,
    c: &StoredCart,
    mut q: Value,
) -> Result<Value> {
    let b2b = q["price"]["taxStatus"] == "net";
    let decimals = q["price"]["currencyScale"].as_i64().unwrap_or(2) as i32;
    let factor = 10_f64.powi(decimals);
    let pricing_rate = q["currencyContext"]["pricingFactor"]
        .as_str()
        .map(crate::currencies::rate_units)
        .transpose()?
        .unwrap_or(100_000_000) as f64;
    let rate = q["currencyContext"]["factor"]
        .as_str()
        .map(crate::currencies::rate_units)
        .transpose()?
        .unwrap_or(100_000_000) as f64
        / pricing_rate;
    let rows = sqlx::query(
        "SELECT id,data FROM commerce_promotions WHERE tenant=$1 ORDER BY id FOR UPDATE",
    )
    .bind(&c.tenant)
    .fetch_all(&mut *tx)
    .await?;
    let mut evaluated = q.clone();
    if !rows.is_empty() {
        evaluated["ruleFacts"] = facts::rule_facts(tx, c, &q).await?;
        super::rule_snapshot::attach(
            tx,
            &c.tenant,
            &json!(
                rows.iter()
                    .map(|r| r.get::<Value, _>("data"))
                    .collect::<Vec<_>>()
            ),
            &mut evaluated["ruleFacts"],
        )
        .await?;
    }
    let mut applicable = vec![];
    for r in rows {
        let p: Promotion =
            serde_json::from_value(r.get("data")).map_err(|_| bad("Invalid promotion"))?;
        // New statement snapshot after row locks: concurrent checkout sees the preceding committed use.
        let uses: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM promotion_uses WHERE tenant=$1 AND promotion=$2",
        )
        .bind(&c.tenant)
        .bind(r.get::<String, _>("id"))
        .fetch_one(&mut *tx)
        .await?;
        if !p.active
            || p.max_uses.is_some_and(|n| uses >= n)
            || p.code.as_ref().is_some_and(|v| !c.data.coupons.contains(v))
            || !p.rule.checked_matches(c, &evaluated)?
        {
            continue;
        }
        let valid:bool=sqlx::query_scalar("SELECT ($1::text IS NULL OR now()>=$1::timestamptz) AND ($2::text IS NULL OR now()<=$2::timestamptz)").bind(&p.start).bind(&p.end).fetch_one(&mut *tx).await?;
        if valid {
            applicable.push((r.get::<String, _>("id"), p));
        }
    }
    applicable.sort_by(|a, b| b.1.priority.cmp(&a.1.priority).then(a.0.cmp(&b.0)));
    let positions = q["lineItems"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["price"]["totalPrice"].as_f64().unwrap())
        .sum::<f64>();
    let tax = q["lineItems"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|l| l["price"]["calculatedTaxes"].as_array().unwrap())
        .map(|t| t["tax"].as_f64().unwrap())
        .sum::<f64>();
    let original = math_round(if b2b { positions + tax } else { positions }, decimals);
    q["price"]["positionPrice"] = json!(math_round(positions, decimals));
    q["price"]["totalPrice"] = json!(original);
    q["price"]["tax"] = json!(math_round(tax, decimals));
    q["price"]["netPrice"] = json!(math_round(
        if b2b { positions } else { positions - tax },
        decimals
    ));
    let mut discounts = vec![];
    for (id, p) in applicable {
        if p.kind == "free_shipping" {
            q["promotionFreeShipping"] = json!(true);
            discounts.push(json!({"id":id,"name":p.name,"kind":p.kind,"amount":0}));
        } else {
            let total = q["price"]["positionPrice"].as_f64().unwrap();
            if total <= 0. {
                continue;
            }
            let ratio = if p.kind == "percentage" {
                p.amount / 100.
            } else {
                (p.amount * rate / total).min(1.)
            };
            let totals = q["lineItems"]
                .as_array()
                .unwrap()
                .iter()
                .map(|l| (l["price"]["totalPrice"].as_f64().unwrap() * factor).round() as i64)
                .collect::<Vec<_>>();
            let allocated =
                vendune::discount::allocate(&totals, (total * ratio * factor).round() as i64);
            let mut after = 0.;
            let mut tax = 0.;
            for (index, line) in q["lineItems"]
                .as_array_mut()
                .unwrap()
                .iter_mut()
                .enumerate()
            {
                let tax_rate = line["price"]["calculatedTaxes"][0]["taxRate"]
                    .as_f64()
                    .unwrap_or(0.);
                let discounted = allocated[index] as f64 / factor;
                let calc = calculate(&PriceInput {
                    price: discounted,
                    decimals,
                    interval: 1. / factor,
                    quantity: 1,
                    tax_rate,
                    gross: !b2b,
                    ..PriceInput::default()
                });
                let quantity = line["quantity"].as_u64().unwrap_or(1) as f64;
                line["price"]["totalPrice"] = json!(calc.total_price);
                line["price"]["unitPrice"] =
                    json!(math_round(calc.total_price / quantity, decimals));
                line["price"]["calculatedTaxes"] = json!(
                    calc.calculated_taxes
                        .iter()
                        .map(|t| json!({"tax":t.tax,"taxRate":t.tax_rate,"price":t.price}))
                        .collect::<Vec<_>>()
                );
                after += calc.total_price;
                tax += calc.tax;
            }
            after = math_round(after, decimals);
            tax = math_round(tax, decimals);
            q["price"]["positionPrice"] = json!(after);
            q["price"]["tax"] = json!(tax);
            q["price"]["netPrice"] = json!(if b2b {
                after
            } else {
                math_round(after - tax, decimals)
            });
            q["price"]["totalPrice"] = json!(if b2b {
                math_round(after + tax, decimals)
            } else {
                after
            });
            discounts.push(
                json!({"id":id,"name":p.name,"kind":p.kind,"amount":math_round(total-after,decimals)}),
            );
        }
        if p.exclusive {
            break;
        }
    }
    q["discounts"] = json!(discounts);
    q["discountTotal"] = json!(math_round(
        original - q["price"]["totalPrice"].as_f64().unwrap(),
        decimals
    ));
    q["couponCodes"] = json!(c.data.coupons);
    Ok(q)
}
pub(crate) async fn record_uses(
    tx: &mut sqlx::PgConnection,
    t: &str,
    order: &str,
    q: &Value,
) -> Result<()> {
    for d in q["discounts"].as_array().unwrap_or(&vec![]) {
        sqlx::query("INSERT INTO promotion_uses(tenant,promotion,order_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING").bind(t).bind(d["id"].as_str()).bind(order).execute(&mut *tx).await?;
    }
    Ok(())
}
