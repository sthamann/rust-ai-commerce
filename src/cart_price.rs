//! Authoritative quantity pricing and localized checkout quote assembly.
use crate::*;

pub(crate) fn quote(c: &StoredCart, ps: &[Product]) -> Result<Value> {
    let b2b = c.data.group == "business";
    let mut lines = vec![];
    let mut total = 0.;
    let mut taxes = 0.;
    for i in &c.data.items {
        let p = ps
            .iter()
            .find(|p| p.id == i.id)
            .ok_or(bad(format!("Unknown product {}", i.id)))?;
        if normalized_quantity(p, i.quantity)? != i.quantity {
            return Err(bad(
                "Quantity does not match product minimum/steps; update cart",
            ));
        }
        let rule_ids = if b2b {
            vec!["business".into()]
        } else {
            vec!["consumer".into()]
        };
        let tier = vendune::context::select_tier(&p.advanced_prices, &rule_ids, i.quantity);
        let discount = 1. - tier.map(|t| t.discount).unwrap_or(0.);
        let base = if b2b {
            p.price / (1. + p.tax_rate / 100.)
        } else {
            p.price
        };
        let mut calc = calculate(&PriceInput {
            price: base * discount,
            quantity: i.quantity,
            tax_rate: p.tax_rate,
            gross: !b2b,
            calculated: true,
            decimals: 2,
            interval: 0.01,
            round_for_net: false,
            list_price: p
                .list_price
                .map(|v| if b2b { v / (1. + p.tax_rate / 100.) } else { v }),
            regulation_price: p
                .regulation_price
                .map(|v| if b2b { v / (1. + p.tax_rate / 100.) } else { v }),
            reference: p.reference_price.clone(),
            ..PriceInput::default()
        });
        for config in c
            .data
            .app_configurations
            .values()
            .filter(|v| v.product_id == i.id)
        {
            let gross = config.fee_minor as f64 / 100.;
            let fee = calculate(&PriceInput {
                price: if b2b {
                    gross / (1. + p.tax_rate / 100.)
                } else {
                    gross
                },
                quantity: i.quantity,
                tax_rate: p.tax_rate,
                gross: !b2b,
                ..PriceInput::default()
            });
            calc.unit_price = math_round(calc.unit_price + fee.unit_price, 2);
            calc.total_price = math_round(calc.total_price + fee.total_price, 2);
            calc.tax = math_round(calc.tax + fee.tax, 2);
            calc.calculated_taxes.extend(fee.calculated_taxes);
        }
        total += calc.total_price;
        taxes += calc.tax;
        lines.push(json!({"id":p.id,"referencedId":p.id,"parentId":p.parent_id,"label":format!("{}{}",p.name,p.options.as_object().filter(|o|!o.is_empty()).map(|o|format!(" · {}",o.values().filter_map(|v|v.as_str()).collect::<Vec<_>>().join(" / "))).unwrap_or_default()),"quantity":i.quantity,"stock":p.stock,"price":{"unitPrice":calc.unit_price,"totalPrice":calc.total_price,"calculatedTaxes":calc.calculated_taxes.iter().map(|t|json!({"tax":t.tax,"taxRate":t.tax_rate,"price":t.price})).collect::<Vec<_>>(),"listPrice":calc.list_price,"regulationPrice":calc.regulation_price.map(|price|json!({"price":price})),"referencePrice":calc.reference_price},"discountPercent":math_round((1.-discount)*100.,0),"ruleId":tier.map(|t|&t.rule_id),"minPurchase":p.min_purchase,"purchaseSteps":p.purchase_steps,"maxPurchase":p.max_purchase}));
    }
    for line in &mut lines {
        let mut configs = c
            .data
            .app_configurations
            .values()
            .filter(|v| Some(v.product_id.as_str()) == line["id"].as_str())
            .map(|v| json!(v))
            .collect::<Vec<_>>();
        configs.sort_by(|a, b| a["app"].as_str().cmp(&b["app"].as_str()));
        if !configs.is_empty() {
            line["configuration"] = configs[0].clone();
            line["appConfigurations"] = json!(configs);
        }
    }
    let total = math_round(total, 2);
    let taxes = math_round(taxes, 2);
    let payable = if b2b {
        math_round(total + taxes, 2)
    } else {
        total
    };
    Ok(
        json!({"token":c.token,"id":c.id,"revision":c.revision,"status":c.status,"lineItems":lines,"customerGroup":c.data.group,"customerId":c.data.customer_id,"customerEmail":c.data.email,"company":c.data.company,"price":{"positionPrice":total,"totalPrice":payable,"netPrice":if b2b{total}else{math_round(total-taxes,2)},"tax":taxes,"taxStatus":if b2b{"net"}else{"gross"},"currency":"EUR"},"order":c.data.order}),
    )
}
pub(crate) fn normalized_quantity(p: &Product, q: u32) -> Result<u32> {
    let available = p.max_purchase.unwrap_or(10000).min(10000);
    if available < p.min_purchase {
        return Err(bad("Product cannot be purchased in an allowed quantity"));
    }
    Ok(vendune::context::fix_quantity(
        p.min_purchase as i64,
        q.max(p.min_purchase).min(available) as i64,
        p.purchase_steps as i64,
    ) as u32)
}
pub(crate) async fn cart_json(a: &App, c: &StoredCart) -> Result<Value> {
    let mut h = HeaderMap::new();
    h.insert(
        "x-tenant",
        c.tenant.parse().map_err(|_| bad("Invalid tenant"))?,
    );
    if !c.data.locale.is_empty() {
        h.insert(
            "x-commerce-locale",
            c.data
                .locale
                .parse()
                .map_err(|_| bad("Invalid stored locale"))?,
        );
    }
    let (locale, chain) = language_context(a, &h).await?;
    if c.status == "completed"
        && let Some(order) = &c.data.order
    {
        let mut result = order["cart"].clone();
        result["status"] = json!(c.status);
        result["order"] = order.clone();
        return Ok(result);
    }
    let ps = commerce::cart_products(a, &c.tenant, &chain, &c.data.items).await?;
    let (config, revision) = commerce::scoped_config(a, &c.tenant, &c.data.sales_channel).await?;
    let original = commerce::selection(&c.data);
    let selected = commerce::resolve_selection(original.clone(), &c.data.group, &config);
    let changed = json!(original) != json!(selected);
    let mut preview = c.clone();
    preview.data.checkout = Some(selected.clone());
    let taxes =
        commerce::tax_settings_for_cart(&mut *a.db.acquire().await?, &preview, &ps, &config)
            .await?;
    let ps = commerce::tax_products(&ps, &selected, &taxes)?;
    let q = marketing::promote(
        &mut *a.db.acquire().await?,
        &preview,
        commerce::enrich(quote(&preview, &ps)?, &preview, &ps, &config, revision)?,
    )
    .await?;
    let mut result = commerce::enrich(q, &preview, &ps, &config, revision)?;
    result["selectionNeedsConfirmation"] = json!(changed);
    commerce::dates(a, &mut result).await?;
    result["locale"] = json!(locale);
    result["languageIdChain"] = json!(chain);
    Ok(result)
}
