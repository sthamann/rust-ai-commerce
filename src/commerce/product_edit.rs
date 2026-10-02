//! Revision-bound multilingual product metadata: specifications, SEO, cross-selling and free shipping.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Edit {
    revision: i64,
    translations: HashMap<String, Translation>,
    extra: Extra,
    #[serde(default)]
    commerce: Option<ProductFields>,
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
    seo: HashMap<String, Seo>,
    specifications: HashMap<String, HashMap<String, String>>,
    cross_selling: Vec<String>,
    shipping_free: bool,
    #[serde(default)]
    digital: bool,
    #[serde(default)]
    rich_description: Value,
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
    auth::permit(&h, "catalog")?;
    let t = merchant(&a, &h)?;
    let edit: Edit = serde_json::from_value(v).map_err(|_| bad("Invalid product metadata"))?;
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
    if let Some(fields) = &edit.commerce {
        fields.validate()?;
    }
    let mut tx = a.db.begin().await?;
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
    tx.commit().await?;
    Ok(Json(json!({"saved":true,"revision":edit.revision+1})))
}
pub(crate) async fn product_editor(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
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
    Ok(Json(
        json!({"revision":r.get::<i64,_>("revision"),"translations":translations,"extra":r.get::<Value,_>("extra"),"commerce":editable_fields(&r)}),
    ))
}
