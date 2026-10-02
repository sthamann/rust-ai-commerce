//! Health and localized catalogue HTTP routes.
use crate::*;

pub(crate) async fn health(State(a): State<App>) -> Result<Json<Value>> {
    sqlx::query("SELECT 1").execute(&a.db).await?;
    Ok(Json(
        json!({"status":"ok","database":"postgresql","knowledge":"Apache AGE + pgvector","model":*a.model,"payment":"simulated","version":env!("CARGO_PKG_VERSION")}),
    ))
}
pub(crate) async fn catalog_request(
    State(a): State<App>,
    h: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>> {
    // Drain the POST body before returning a large response. Otherwise clients
    // sending headers and body separately can observe a reset/truncated response.
    let criteria = if body.is_empty() {
        CatalogCriteria::default()
    } else {
        serde_json::from_slice(&body).map_err(|_| bad("Invalid catalog criteria"))?
    };
    catalog_page(State(a), h, criteria).await
}

pub(crate) async fn catalog_page(
    State(a): State<App>,
    h: HeaderMap,
    mut criteria: CatalogCriteria,
) -> Result<Json<Value>> {
    let (locale, chain) = language_context(&a, &h).await?;
    let t = tenant(&h)?;
    criteria.product_ids = marketing::catalog_scope(&a, &h).await?;
    let page = product_page(&a, &t, &chain, &criteria).await?;
    let ps = &page.products;
    let mut data = vec![];
    let c = if header(&h, "sw-context-token").is_some() {
        Some(load_cart(&a, &h).await?)
    } else {
        None
    };
    let (settings, _) = commerce::config(&a, &t).await?;
    let selected = c
        .as_ref()
        .map(|c| commerce::selection(&c.data))
        .unwrap_or_else(commerce::CheckoutSelection::defaults);
    let selected = commerce::resolve_selection(
        selected,
        c.as_ref()
            .map(|c| c.data.group.as_str())
            .unwrap_or("consumer"),
        &settings,
    );
    let priced = commerce::tax_products(ps, &selected, &settings)?;
    for p in &priced {
        let mut preview = if let Some(c) = &c {
            c.clone()
        } else {
            StoredCart {
                id: "preview".into(),
                tenant: t.clone(),
                token: String::new(),
                revision: 0,
                status: "preview".into(),
                data: Cart {
                    coupons: vec![],
                    sales_channel: marketing::channel_id(&h).into(),
                    app_configurations: HashMap::new(),
                    items: vec![],
                    group: "consumer".into(),
                    email: None,
                    company: None,
                    session: String::new(),
                    buyer: None,
                    order: None,
                    locale: locale.clone(),
                    channel: "preview".into(),
                    checkout: None,
                },
            }
        };
        preview.data.items = vec![Item {
            id: p.id.clone(),
            quantity: p.min_purchase,
        }];
        // This preview contains one item. Searching the entire catalog for each
        // preview would turn catalog hydration into quadratic work.
        let q = quote(&preview, std::slice::from_ref(p))?;
        let mut v = json!(p);
        v["calculated_price"] = q["lineItems"][0]["price"].clone();
        data.push(v);
    }
    Ok(Json(
        json!({"elements":data,"total":if criteria.after.is_none() && page.next_cursor.is_none() {Some(ps.len())} else {None},"nextCursor":page.next_cursor,"hasMore":page.next_cursor.is_some(),"limit":page.limit,"locale":locale,"languageIdChain":chain}),
    ))
}
