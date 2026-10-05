//! Shop locale resolution, translated catalog hydration and non-mutating merchant quote.
use super::*;
use vendune::context::{Language, language_chain};

pub(super) async fn language_context(a: &App, h: &HeaderMap) -> Result<(String, Vec<String>)> {
    let (settings, _) = commerce::config(a, &tenant(h)?).await?;
    let locale = header(h, "x-commerce-locale").unwrap_or(&settings.main_locale);
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
    let mut chain =
        language_chain(&selected.get::<String, _>("id"), &available, &languages).map_err(bad)?;
    if settings.main_locale != "en-GB" {
        let main = rows
            .iter()
            .find(|r| r.get::<String, _>("locale") == settings.main_locale)
            .ok_or(bad("Main language unavailable"))?
            .get::<String, _>("id");
        let current = selected.get::<String, _>("id");
        chain.retain(|id| id != vendune::context::SYSTEM_LANGUAGE || id == &current);
        if !chain.contains(&main) {
            chain.push(main);
        }
    }
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
    let languages = sqlx::query("SELECT id,locale FROM languages WHERE id=ANY($1)")
        .bind(chain)
        .fetch_all(&a.db)
        .await?;
    let locale_chain = chain
        .iter()
        .filter_map(|id| {
            languages
                .iter()
                .find(|l| l.get::<String, _>("id") == *id)
                .map(|l| l.get::<String, _>("locale"))
        })
        .collect::<Vec<_>>();
    for p in &mut ps {
        super::commerce::localize_extra(&mut p.extra, &locale_chain);
        if let Some(media) = p.media.as_array_mut() {
            for m in media {
                if m["alt"].is_object() {
                    let text = locale_chain
                        .iter()
                        .flat_map(|l| [l.as_str(), l.split('-').next().unwrap_or(l)])
                        .find_map(|l| m["alt"][l].as_str())
                        .map(str::to_owned);
                    if let Some(text) = text {
                        m["view"] = json!(text);
                    }
                }
            }
        }
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
    let (settings, _) = commerce::config(&a, &tenant(&h)?).await?;
    Ok(Json(
        json!({"locale":locale,"mainLocale":settings.main_locale,"languageIdChain":chain,"availableLocales":settings.locales,"currency":"EUR","taxStates":["gross","net"]}),
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
    let (settings, _) = commerce::config(&a, &t).await?;
    if !settings.customer_groups.iter().any(|g| g.id == group) {
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
        json!({"locale":locale,"requestedQuantity":requested,"effectiveQuantity":quantity,"quote":quote(&c,&ps,&settings)?,"sideEffects":false}),
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
