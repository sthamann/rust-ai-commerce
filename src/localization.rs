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
pub(super) async fn localized_products(a: &App, t: &str, chain: &[String]) -> Result<Vec<Product>> {
    let mut ps = products(a, t).await?;
    let rows=sqlx::query("SELECT product_id,language_id,name,description FROM product_translations WHERE tenant=$1 AND language_id=ANY($2)").bind(t).bind(chain).fetch_all(&a.db).await?;
    for p in &mut ps {
        for field in ["name", "description"] {
            for id in chain {
                if let Some(row) = rows.iter().find(|r| {
                    r.get::<String, _>("product_id") == p.id
                        && r.get::<String, _>("language_id") == *id
                }) && let Some(value) = row.get::<Option<String>, _>(field)
                {
                    // NULL falls back; an explicitly empty string is a translation.
                    if field == "name" {
                        p.name = value
                    } else {
                        p.description = value
                    };
                    break;
                }
            }
        }
    }
    Ok(ps)
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
    let ps = localized_products(&a, &t, &chain).await?;
    let id = v["productId"].as_str().ok_or(bad("Product ID required"))?;
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
            app_configurations: HashMap::new(),
            items: vec![Item {
                id: id.into(),
                quantity,
            }],
            group: group.into(),
            email: None,
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
