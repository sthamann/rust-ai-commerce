//! Shop locale resolution, translated catalog hydration and non-mutating merchant quote.
use super::*;
use rust_ai_commerce::context::{Language, language_chain};

pub(super) async fn language_context(a: &App, h: &HeaderMap) -> Result<(String, Vec<String>)> {
    let locale = header(h, "x-commerce-locale").unwrap_or("en-GB");
    let rows = sqlx::query("SELECT id,locale,parent_id FROM languages ORDER BY locale")
        .fetch_all(&a.db)
        .await?;
    let selected = if let Some(id) = header(h, "sw-language-id") {
        rows.iter().find(|r| r.get::<String, _>("id") == id)
    } else {
        rows.iter().find(|r| r.get::<String, _>("locale") == locale)
    }
    .ok_or(bad("Language unavailable"))?;
    let available = rows
        .iter()
        .map(|r| r.get::<String, _>("id"))
        .collect::<Vec<_>>();
    let languages = rows
        .iter()
        .map(|r| Language {
            id: r.get("id"),
            parent_id: r.get("parent_id"),
        })
        .collect::<Vec<_>>();
    let chain =
        language_chain(&selected.get::<String, _>("id"), &available, &languages).map_err(bad)?;
    Ok((selected.get("locale"), chain))
}
pub(super) async fn localize_products(
    a: &App,
    t: &str,
    chain: &[String],
    mut ps: Vec<Product>,
) -> Result<Vec<Product>> {
    let ids = ps.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
    let rows=sqlx::query("SELECT product_id,language_id,name,description FROM product_translations WHERE tenant=$1 AND language_id=ANY($2) AND product_id=ANY($3)").bind(t).bind(chain).bind(&ids).fetch_all(&a.db).await?;
    let mut translations: HashMap<String, ProductTranslations> = HashMap::new();
    for row in rows {
        translations
            .entry(row.get("product_id"))
            .or_default()
            .insert(
                row.get("language_id"),
                (row.get("name"), row.get("description")),
            );
    }
    for p in &mut ps {
        if let Some(values) = translations.get(&p.id) {
            if let Some(name) = translated_field(values, chain, false) {
                p.name = name.to_owned();
            }
            if let Some(description) = translated_field(values, chain, true) {
                p.description = description.to_owned();
            }
        }
    }
    Ok(ps)
}
type ProductTranslations = HashMap<String, (Option<String>, Option<String>)>;

fn translated_field<'a>(
    values: &'a ProductTranslations,
    chain: &[String],
    description: bool,
) -> Option<&'a str> {
    // Resolve each field independently: NULL falls back, an empty string does not.
    chain.iter().find_map(|id| {
        values.get(id).and_then(|(name, text)| {
            if description {
                text.as_deref()
            } else {
                name.as_deref()
            }
        })
    })
}

pub(super) async fn context_info(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (locale, chain) = language_context(&a, &h).await?;
    Ok(Json(
        json!({"locale":locale,"languageIdChain":chain,"availableLocales":["de-DE","en-GB","fr-FR","es-ES","de-CH"],"currency":"EUR","taxStates":["gross","net"],"rules":"demo customer-group membership; not the full Rule Builder"}),
    ))
}
pub(super) async fn preview_quote(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let (locale, chain) = language_context(&a, &h).await?;
    let id = v["productId"].as_str().ok_or(bad("Product ID required"))?;
    let ps = commerce::cart_products(
        &a,
        &t,
        &chain,
        &[Item {
            id: id.into(),
            quantity: 1,
        }],
    )
    .await?;
    let product = ps
        .iter()
        .find(|p| p.id == id)
        .ok_or(bad("Unknown product"))?;
    let requested = v["quantity"]
        .as_u64()
        .filter(|q| *q > 0 && *q <= 10000)
        .ok_or(bad("Quantity must be 1..10000"))? as u32;
    let group = v["customerGroup"].as_str().unwrap_or("consumer");
    if !["consumer", "business"].contains(&group) {
        return Err(bad("Unknown customer group"));
    }
    let quantity = normalized_quantity(product, requested)?;
    let c = StoredCart {
        id: "preview".into(),
        tenant: t,
        token: String::new(),
        revision: 0,
        status: "preview".into(),
        data: Cart {
            coupons: vec![],
            sales_channel: "default".into(),
            app_configurations: HashMap::new(),
            items: vec![Item {
                id: id.into(),
                quantity,
            }],
            group: group.into(),
            email: None,
            customer_id: None,
            company: None,
            session: String::new(),
            buyer: None,
            order: None,
            locale: locale.clone(),
            channel: "preview".into(),
            checkout: None,
        },
    };
    Ok(Json(
        json!({"locale":locale,"requestedQuantity":requested,"effectiveQuantity":quantity,"quote":quote(&c,&ps)?,"sideEffects":false}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexed_translations_preserve_field_fallback_and_empty_values() {
        let values = HashMap::from([
            ("child".into(), (Some(String::new()), None)),
            (
                "parent".into(),
                (
                    Some("Parent name".into()),
                    Some("Parent description".into()),
                ),
            ),
        ]);
        let chain = vec!["missing".into(), "child".into(), "parent".into()];
        assert_eq!(translated_field(&values, &chain, false), Some(""));
        assert_eq!(
            translated_field(&values, &chain, true),
            Some("Parent description")
        );
        assert_eq!(translated_field(&values, &["absent".into()], false), None);
    }
}
