//! Shipping costs, proportional taxes and calendar delivery windows.
use super::*;

pub(crate) fn selection(c: &Cart) -> CheckoutSelection {
    c.checkout
        .clone()
        .unwrap_or_else(CheckoutSelection::defaults)
}
pub(crate) fn enrich(
    mut q: Value,
    c: &StoredCart,
    ps: &[Product],
    s: &Settings,
    revision: i64,
) -> Result<Value> {
    let selected = selection(&c.data);
    let shipping = s
        .shipping
        .iter()
        .find(|v| {
            v.id == selected.shipping_method_id
                && v.active
                && v.countries.contains(&selected.country)
        })
        .ok_or(bad("Shipping method is unavailable for this country"))?;
    let payment = s
        .payments
        .iter()
        .find(|v| {
            v.id == selected.payment_method_id
                && v.active
                && (!v.business_only || c.data.group == "business")
        })
        .ok_or(bad("Payment method is unavailable for this customer"))?;
    let position = q["price"]["positionPrice"].as_f64().unwrap();
    let gross_items = q["price"]["totalPrice"].as_f64().unwrap();
    let free = shipping
        .free_above
        .is_some_and(|limit| gross_items >= limit);
    let all_free = !c.data.items.is_empty()
        && c.data.items.iter().all(|i| {
            ps.iter()
                .find(|p| p.id == i.id)
                .is_some_and(|p| p.extra["shippingFree"] == true || p.extra["digital"] == true)
        });
    let gross = if c.data.items.is_empty() || free || all_free || q["promotionFreeShipping"] == true
    {
        0.
    } else {
        shipping.price
    };
    let mut taxes: Vec<rust_ai_commerce::pricing::CalculatedTax> = vec![];
    for line in q["lineItems"].as_array().unwrap() {
        for v in line["price"]["calculatedTaxes"].as_array().unwrap() {
            let rate = v["taxRate"].as_f64().unwrap();
            if let Some(t) = taxes.iter_mut().find(|t| t.tax_rate == rate) {
                t.price += v["price"].as_f64().unwrap();
                t.tax += v["tax"].as_f64().unwrap();
            } else {
                taxes.push(rust_ai_commerce::pricing::CalculatedTax {
                    tax_rate: rate,
                    tax: v["tax"].as_f64().unwrap(),
                    price: v["price"].as_f64().unwrap(),
                });
            }
        }
    }
    let rules = if shipping.tax_type == "highest" {
        taxes
            .iter()
            .map(|t| t.tax_rate)
            .max_by(f64::total_cmp)
            .map(|tax_rate| {
                vec![TaxRule {
                    tax_rate,
                    percentage: 100.,
                }]
            })
            .unwrap_or_default()
    } else {
        proportional_tax_rules(&taxes, position)
    };
    let gross_calc = calculate(&PriceInput {
        price: gross,
        quantity: 1,
        tax_rules: Some(rules.clone()),
        ..PriceInput::default()
    });
    let shipping_net = math_round(gross - gross_calc.tax, 2);
    // Native method prices are gross amounts; explicit net component for B2B display.
    let cost = json!({"unitPrice":if c.data.group=="business"{shipping_net}else{gross},"totalPrice":gross,"netPrice":shipping_net,"tax":gross_calc.tax,"calculatedTaxes":gross_calc.calculated_taxes});
    q["price"]["totalPrice"] = json!(math_round(gross_items + gross, 2));
    q["price"]["netPrice"] = json!(math_round(
        q["price"]["netPrice"].as_f64().unwrap() + shipping_net,
        2
    ));
    q["price"]["tax"] = json!(math_round(
        q["price"]["tax"].as_f64().unwrap() + gross_calc.tax,
        2
    ));
    q["shippingCosts"] = cost.clone();
    q["checkout"] = json!(selected);
    q["configurationRevision"] = json!(revision);
    q["availableCountries"] = json!(s.countries);
    q["availableShippingMethods"] =
        json!(s.shipping.iter().filter(|v| v.active).collect::<Vec<_>>());
    q["availablePaymentMethods"] = json!(
        s.payments
            .iter()
            .filter(|v| v.active && (!v.business_only || c.data.group == "business"))
            .collect::<Vec<_>>()
    );
    let lead = c
        .data
        .items
        .iter()
        .filter_map(|i| ps.iter().find(|p| p.id == i.id))
        .map(|p| p.delivery_days)
        .max()
        .unwrap_or(0);
    let (min, max) = if shipping.id == "pickup" {
        (0, 0)
    } else {
        (lead.max(shipping.min_days), lead.max(shipping.max_days))
    };
    q["deliveries"] = if c.data.items.is_empty()
        || c.data.items.iter().all(|i| {
            ps.iter()
                .any(|p| p.id == i.id && p.extra["digital"] == true)
        }) {
        json!([])
    } else {
        json!([{"shippingMethod":shipping,"shippingCosts":cost,"shippingLocation":{"country":selected.country,"address":selected.address},"positions":c.data.items.iter().filter(|i|!ps.iter().any(|p|p.id==i.id&&p.extra["digital"]==true)).collect::<Vec<_>>(),"state":"open","deliveryTime":{"minDays":min,"maxDays":max}}])
    };
    q["paymentMethod"] = json!(payment);
    Ok(q)
}
pub(crate) async fn dates(a: &App, q: &mut Value) -> Result<()> {
    dates_conn(&mut *a.db.acquire().await?, q).await
}
pub(crate) async fn dates_conn(conn: &mut sqlx::PgConnection, q: &mut Value) -> Result<()> {
    if let Some(d) = q["deliveries"].as_array_mut().and_then(|d| d.first_mut()) {
        let min = d["deliveryTime"]["minDays"].as_i64().unwrap() as i32;
        let max = d["deliveryTime"]["maxDays"].as_i64().unwrap() as i32;
        let r = sqlx::query(
            "SELECT (current_date+$1)::text AS earliest,(current_date+$2)::text AS latest",
        )
        .bind(min)
        .bind(max)
        .fetch_one(conn)
        .await?;
        d["deliveryDate"] = json!({"earliest":r.get::<String,_>("earliest"),"latest":r.get::<String,_>("latest"),"basis":"calendar-days"});
    }
    Ok(())
}
