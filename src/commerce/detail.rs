//! Product family, context prices, gallery, properties and review aggregates.
use super::*;

pub(crate) async fn product_detail(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    axum::extract::Query(mut criteria): axum::extract::Query<CatalogCriteria>,
) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    marketing::admit_product(&a, &h, &id).await?;
    let (_, chain) = language_context(&a, &h).await?;
    criteria.product_ids = marketing::catalog_scope(&a, &h).await?;
    let (ps, family, next_cursor) = family_products(&a, &t, &chain, &id, &criteria).await?;
    let p = ps
        .iter()
        .find(|p| p.id == id)
        .ok_or(Error(StatusCode::NOT_FOUND, "Product not found".into()))?;
    let visible = marketing::filter_channel(&a, &h, ps.clone()).await?;
    let family_ps = visible
        .iter()
        .filter(|v| v.id == family || v.parent_id.as_deref() == Some(&family))
        .collect::<Vec<_>>();
    let c = if header(&h, "sw-context-token").is_some() {
        Some(load_cart(&a, &h).await?)
    } else {
        None
    };
    let group = c
        .as_ref()
        .map(|c| c.data.group.as_str())
        .unwrap_or("consumer");
    let selection = c
        .as_ref()
        .map(|c| selection(&c.data))
        .unwrap_or_else(CheckoutSelection::defaults);
    let (config, _) = config(&a, &t).await?;
    let selection = resolve_selection(selection, group, &config);
    let priced = tax_products(&ps, &selection, &config)?;
    let mut quantities = vec![p.min_purchase];
    for tier in &p.advanced_prices {
        if tier.rule_id == group {
            quantities.push(tier.quantity_start);
        }
    }
    quantities.sort();
    quantities.dedup();
    let mut price_tiers = vec![];
    for requested in quantities {
        let qty = normalized_quantity(p, requested)?;
        let preview = StoredCart {
            id: "preview".into(),
            tenant: t.clone(),
            token: String::new(),
            revision: 0,
            status: "preview".into(),
            data: Cart {
                coupons: vec![],
                sales_channel: "default".into(),
                app_configurations: HashMap::new(),
                items: vec![Item {
                    id: id.clone(),
                    quantity: qty,
                }],
                group: group.into(),
                email: None,
                customer_id: None,
                company: None,
                session: String::new(),
                buyer: None,
                order: None,
                locale: String::new(),
                channel: "preview".into(),
                checkout: None,
            },
        };
        let q = quote(&preview, &priced)?;
        price_tiers.push(json!({"quantity":qty,"price":q["lineItems"][0]["price"],"discountPercent":q["lineItems"][0]["discountPercent"]}));
    }
    // Review aggregates cover the whole family, independently of variant pagination.
    let rows=sqlx::query("SELECT r.id,r.author,r.rating,r.title,r.content,r.verified,r.demo,r.created_at::text AS time FROM product_reviews r WHERE r.tenant=$1 AND r.approved AND (r.product_id=$2 OR EXISTS(SELECT 1 FROM products p WHERE p.tenant=r.tenant AND p.id=r.product_id AND p.parent_id=$2)) ORDER BY r.created_at DESC LIMIT 50").bind(&t).bind(&family).fetch_all(&a.db).await?;
    let stats=sqlx::query("SELECT count(*) AS count,coalesce(avg(r.rating),0)::double precision AS rating FROM product_reviews r WHERE r.tenant=$1 AND r.approved AND (r.product_id=$2 OR EXISTS(SELECT 1 FROM products p WHERE p.tenant=r.tenant AND p.id=r.product_id AND p.parent_id=$2))").bind(&t).bind(&family).fetch_one(&a.db).await?;
    let count = stats.get::<i64, _>("count");
    let rating = stats.get::<f64, _>("rating");
    let method = config.shipping.iter().find(|v| {
        v.id == selection.shipping_method_id && v.active && v.countries.contains(&selection.country)
    });
    let delivery=method.map(|method|json!({"method":method,"minDays":if method.id=="pickup"{0}else{p.delivery_days.max(method.min_days)},"maxDays":if method.id=="pickup"{0}else{p.delivery_days.max(method.max_days)}}));
    let mut product = serde_json::to_value(priced.iter().find(|v| v.id == id).unwrap()).unwrap();
    let suffix = p
        .options
        .as_object()
        .map(|o| {
            o.values()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(" / ")
        })
        .unwrap_or_default();
    product["variantLabel"] = json!(suffix);
    Ok(Json(
        json!({"product":product,"familyId":family,"variants":family_ps,"variantsPagination":{"nextCursor":next_cursor,"hasMore":next_cursor.is_some(),"limit":criteria.page_size()?},"calculatedPrices":price_tiers,"delivery":delivery,"taxStatus":if group=="business"{"net"}else{"gross"},"country":selection.country,"reviews":{"count":count,"average":rating,"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"author":r.get::<String,_>("author"),"rating":r.get::<i32,_>("rating"),"title":r.get::<String,_>("title"),"content":r.get::<String,_>("content"),"verifiedPurchase":r.get::<bool,_>("verified"),"demo":r.get::<bool,_>("demo"),"time":r.get::<String,_>("time")})).collect::<Vec<_>>()}}),
    ))
}
