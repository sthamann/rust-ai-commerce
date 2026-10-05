//! Revision-bound multilingual product metadata: specifications, SEO, cross-selling and free shipping.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Edit {
    #[serde(default, rename = "id")]
    _id: Option<String>,
    #[serde(default, rename = "channels")]
    _channels: Value,
    revision: i64,
    translations: HashMap<String, Translation>,
    extra: Extra,
    #[serde(default)]
    commerce: Option<ProductFields>,
    #[serde(default)]
    catalog: Option<CatalogFields>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Translation {
    name: String,
    description: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Extra {
    #[serde(default)]
    automation: Value,
    #[serde(default)]
    seo: HashMap<String, Seo>,
    #[serde(default)]
    specifications: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    cross_selling: Vec<String>,
    #[serde(default)]
    shipping_free: bool,
    #[serde(default)]
    digital: bool,
    #[serde(default)]
    rich_description: Value,
    #[serde(default)]
    identity: Value,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Seo {
    title: String,
    description: String,
    slug: String,
}
pub(crate) async fn edit_product(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    save_product(a, h, id, v, false).await
}
pub(crate) async fn create_product(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    save_product(a, h, Uuid::new_v4().to_string(), v, true).await
}
async fn save_product(
    a: App,
    h: HeaderMap,
    id: String,
    v: Value,
    create: bool,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog")?;
    let t = merchant(&a, &h)?;
    let mut edit: Edit = serde_json::from_value(v).map_err(|_| bad("Invalid product metadata"))?;
    if edit.extra.cross_selling.len() > 20
        || edit.extra.seo.len() > 4
        || edit.extra.specifications.len() > 4
        || edit.translations.len() != 4
    {
        return Err(bad(
            "Four product translations and bounded metadata required",
        ));
    }
    for lang in ["en", "de", "fr", "es"] {
        let tr = edit
            .translations
            .get(lang)
            .ok_or(bad("Missing product translation"))?;
        if tr.name.is_empty() || tr.name.len() > 200 || tr.description.len() > 4000 {
            return Err(bad("Invalid translated product text"));
        }
    }
    for (lang, seo) in &edit.extra.seo {
        if !["en", "de", "fr", "es"].contains(&lang.as_str())
            || seo.title.len() > 200
            || seo.description.len() > 500
            || seo.slug.len() > 200
            || seo.slug.contains(['?', '#', '/'])
        {
            return Err(bad("Invalid SEO metadata"));
        }
    }
    for (lang, specs) in &edit.extra.specifications {
        if !["en", "de", "fr", "es"].contains(&lang.as_str())
            || specs.len() > 40
            || specs
                .iter()
                .any(|(k, v)| k.is_empty() || k.len() > 100 || v.len() > 1000)
        {
            return Err(bad("Invalid specification metadata"));
        }
    }
    if !edit.extra.rich_description.is_null() {
        assets::validate_rich(&edit.extra.rich_description)?;
    }
    marketing::validate_metadata("products", &edit.extra.automation)?;
    if let Some(fields) = &edit.commerce {
        fields.validate()?;
    }
    if let Some(c) = &edit.catalog {
        c.validate()?;
    }
    if !edit.extra.identity.is_null()
        && (!edit.extra.identity.is_object() || edit.extra.identity.to_string().len() > 8000)
    {
        return Err(bad("Invalid product identity metadata"));
    }
    if let Some(c) = &edit.catalog {
        if edit.extra.automation.is_null() {
            edit.extra.automation = json!({});
        }
        edit.extra.automation["categoryIds"] = json!(c.category_ids);
    }
    let mut tx = a.db.begin().await?;
    // Serialize product number allocation for this merchant, not globally.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,727))")
        .bind(&t)
        .execute(&mut *tx)
        .await?;
    if create {
        let fields = edit
            .catalog
            .as_ref()
            .ok_or(bad("New product catalog fields required"))?;
        if edit.revision != 0 {
            return Err(bad("New product revision must be zero"));
        }
        if let Some(parent) = &fields.parent_id {
            let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND id=$2 AND parent_id IS NULL)").bind(&t).bind(parent).fetch_one(&mut *tx).await?;
            if !valid || fields.options.is_empty() {
                return Err(bad("Variant parent and options required"));
            }
        }
        sqlx::query("INSERT INTO products(tenant,id,name,description,category,price,tax_rate,stock,revision,parent_id) VALUES($1,$2,$3,$4,'objects',0,19,0,0,$5)").bind(&t).bind(&id).bind(&edit.translations["en"].name).bind(&edit.translations["en"].description).bind(&fields.parent_id).execute(&mut *tx).await?;
    }
    if !create {
        let row = sqlx::query(
            "SELECT revision,parent_id FROM products WHERE tenant=$1 AND id=$2 FOR UPDATE",
        )
        .bind(&t)
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Product not found".into()))?;
        if row.get::<i64, _>("revision") != edit.revision {
            return Err(conflict("Product changed"));
        }
        if edit
            .catalog
            .as_ref()
            .is_some_and(|c| c.parent_id != row.get::<Option<String>, _>("parent_id"))
        {
            return Err(bad("Variant parent cannot be changed"));
        }
    }
    if let Some(c) = &edit.catalog {
        c.save(&mut tx, &t, &id).await?;
    }

    for product in &edit.extra.cross_selling {
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND id=$2)")
                .bind(&t)
                .bind(product)
                .fetch_one(&mut *tx)
                .await?;
        if !exists || product == &id {
            return Err(bad("Invalid cross-selling product"));
        }
    }
    let n=sqlx::query("UPDATE products SET extra=$1,name=$2,description=$3,revision=revision+1 WHERE tenant=$4 AND id=$5 AND revision=$6").bind(json!(edit.extra)).bind(&edit.translations["en"].name).bind(&edit.translations["en"].description).bind(&t).bind(&id).bind(edit.revision).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Product changed"));
    }
    if let Some(fields) = &edit.commerce {
        fields.save(&mut tx, &t, &id).await?;
    }
    for (lang, tr) in edit.translations {
        let locale = match lang.as_str() {
            "en" => "en-GB",
            "de" => "de-DE",
            "fr" => "fr-FR",
            "es" => "es-ES",
            _ => return Err(bad("Unsupported locale")),
        };
        sqlx::query("INSERT INTO product_translations(tenant,product_id,language_id,name,description) SELECT $1,$2,id,$3,$4 FROM languages WHERE locale=$5 ON CONFLICT(tenant,product_id,language_id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description").bind(&t).bind(&id).bind(tr.name).bind(tr.description).bind(locale).execute(&mut *tx).await?;
    }
    let row = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
        .bind(&t)
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;
    knowledge::sync_product(&mut tx, &t, &json!(product(&row))).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,$2,$3)")
        .bind(&t)
        .bind(if create {
            "product.created"
        } else {
            "product.updated"
        })
        .bind(json!({"productId":id,"revision":edit.revision+1}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"saved":true,"revision":edit.revision+1}),
    ))
}
pub(crate) async fn product_editor(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog.read")?;
    let t = merchant(&a, &h)?;
    let r = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
        .bind(&t)
        .bind(&id)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Product unavailable".into()))?;
    let rows=sqlx::query("SELECT l.locale,p.name,p.description FROM languages l LEFT JOIN product_translations p ON p.language_id=l.id AND p.tenant=$1 AND p.product_id=$2 WHERE l.locale IN ('en-GB','de-DE','fr-FR','es-ES')").bind(&t).bind(&id).fetch_all(&a.db).await?;
    let mut translations = json!({});
    for tr in rows {
        let locale: String = tr.get("locale");
        translations[&locale[..2]] = json!({"name":tr.get::<Option<String>,_>("name").unwrap_or_else(||r.get("name")),"description":tr.get::<Option<String>,_>("description").unwrap_or_else(||r.get("description"))});
    }
    let channels = product_channels(&a, &t, &id).await?;
    let selected_channels = channels
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["visible"] == true)
        .map(|c| c["id"].clone())
        .collect::<Vec<_>>();
    let category_ids:Vec<String>=sqlx::query_scalar("SELECT category_id FROM product_categories WHERE tenant=$1 AND product_id=$2 ORDER BY category_id").bind(&t).bind(&id).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"id":id,"channels":channels,"catalog":{"salesChannelIds":selected_channels,"active":r.get::<bool,_>("active"),"productNumber":r.get::<Option<String>,_>("product_number").unwrap_or_else(||id.clone()),"categoryIds":category_ids,"parentId":r.get::<Option<String>,_>("parent_id"),"options":r.get::<Value,_>("options")},"revision":r.get::<i64,_>("revision"),"translations":translations,"extra":r.get::<Value,_>("extra"),"commerce":editable_fields(&r)}),
    ))
}
