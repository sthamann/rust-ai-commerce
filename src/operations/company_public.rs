//! Explicit public legal/brand projection; bank account, domestic tax ID and unlinked uploads remain private.
use super::*;
pub(super) async fn get(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let channel = marketing::channel_id(&h);
    let (settings, _) = commerce::config(&a, &t).await?;
    let locale = header(&h, "x-commerce-locale").unwrap_or(&settings.main_locale);
    marketing::channel(&a, &h, channel, locale).await?;
    let mut tx = a.db.begin().await?;
    master_data::lock(&mut tx, &t).await?;
    let base = master_data::records(&mut tx, &t, None).await?;
    let patch: Option<Value> =
        sqlx::query_scalar("SELECT data FROM company_overrides WHERE tenant=$1 AND channel_id=$2")
            .bind(&t)
            .bind(channel)
            .fetch_optional(&mut *tx)
            .await?;
    let data = company_model::resolve(&base["data"], &patch.unwrap_or(json!({})));
    tx.commit().await?;
    let mut public = json!({});
    for key in [
        "name",
        "address",
        "street",
        "houseNumber",
        "additionalAddressLine1",
        "additionalAddressLine2",
        "postalCode",
        "city",
        "country",
        "countryStateId",
        "legalForm",
        "registrationNumber",
        "registerType",
        "registerCourt",
        "managingDirectors",
        "legalRepresentatives",
        "contentResponsible",
        "contentResponsibleAddress",
        "vatId",
        "economicId",
        "email",
        "phoneNumber",
        "website",
        "supervisoryAuthority",
        "professionalChamber",
        "professionalTitle",
        "professionalCountry",
        "professionalRulesUrl",
        "shareCapital",
        "outstandingCapital",
        "liquidationNotice",
    ] {
        if let Some(value) = data.get(key) {
            public[key] = value.clone();
        }
    }
    for key in company_model::LOCALIZED {
        public[*key] = json!(commerce::translated_string(
            &data[*key],
            locale,
            &settings.main_locale
        ));
    }
    if let Some(logo) = data["logoId"].as_str().filter(|s| !s.is_empty()) {
        public["logoId"] = json!(logo);
        public["logoUrl"] = json!(format!(
            "/store-api/company-logo/{logo}?shop={t}&channel={channel}"
        ));
    }
    Ok(Json(
        json!({"data":public,"salesChannelId":channel,"mainLocale":settings.main_locale}),
    ))
}
