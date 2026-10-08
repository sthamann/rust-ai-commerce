//! Cart/channel-bound affirmative choices; stale/expired policy receipts never authorize processing.
use super::*;
use model::{PURPOSES, version};
pub(crate) async fn policy(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let channel = marketing::channel_id(&h);
    let (s, _) = commerce::scoped_config(&a, &t, channel).await?;
    marketing::channel(&a, &h, channel, &language_context(&a, &h).await?.0).await?;
    Ok(Json(
        json!({"data":public_config(&s.legal),"policyVersion":version(&s.legal),"mainLocale":s.main_locale,"locales":s.locales,"salesChannelId":channel}),
    ))
}
pub(super) async fn read(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let (s, _) = commerce::scoped_config(&a, &c.tenant, &c.data.sales_channel).await?;
    let r=sqlx::query("SELECT data,policy_version,expires_at>now() AS fresh FROM privacy_consents WHERE tenant=$1 AND cart_id=$2 AND channel_id=$3").bind(&c.tenant).bind(&c.id).bind(&c.data.sales_channel).fetch_optional(&a.db).await?;
    Ok(Json(
        r.filter(|r| {
            r.get::<String, _>("policy_version") == version(&s.legal) && r.get::<bool, _>("fresh")
        })
        .map(|r| r.get::<Value, _>("data"))
        .unwrap_or(json!({"choices":{},"policyVersion":version(&s.legal),"decided":false})),
    ))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Choice {
    policy_version: String,
    choices: HashMap<String, bool>,
}
pub(super) async fn write(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Choice>,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT id FROM carts WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(&c.tenant)
        .bind(&c.id)
        .fetch_one(&mut *tx)
        .await?;
    let count:i64=sqlx::query_scalar("SELECT count(*) FROM privacy_consent_log WHERE tenant=$1 AND cart_id=$2 AND created_at>now()-interval '1 day'").bind(&c.tenant).bind(&c.id).fetch_one(&mut *tx).await?;
    let (s, _) = commerce::scoped_locked(&mut tx, &c.tenant, &c.data.sales_channel).await?;
    if version(&s.legal) != v.policy_version {
        return Err(conflict("Privacy policy changed; review your choices"));
    }
    if v.choices.keys().any(|p| !PURPOSES.contains(&p.as_str())) {
        return Err(bad("Unknown consent purpose"));
    }
    let choices = PURPOSES
        .iter()
        .map(|p| {
            (
                (*p).to_string(),
                v.choices.get(*p) == Some(&true) && s.legal.purposes.get(*p) == Some(&true),
            )
        })
        .collect::<HashMap<_, _>>();
    // Revocation stays available even after admission is exhausted; identical choices do not renew expiry.
    if let Some(r) = sqlx::query("SELECT data FROM privacy_consents WHERE tenant=$1 AND cart_id=$2 AND channel_id=$3 AND policy_version=$4 AND expires_at>now() FOR UPDATE")
      .bind(&c.tenant).bind(&c.id).bind(&c.data.sales_channel).bind(&v.policy_version).fetch_optional(&mut *tx).await? {
        let saved:Value=r.get("data");
        if saved["choices"]==json!(choices) { return Ok(Json(saved)); }
    }
    if count >= 100 && choices.values().any(|v| *v) {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Consent change limit reached".into(),
        ));
    }
    let receipt = json!({"choices":choices,"policyVersion":v.policy_version,"decided":true,"recordedAt":chrono::Utc::now().to_rfc3339(),"expiresAt":(chrono::Utc::now()+chrono::Duration::days(s.legal.consent_days.into())).to_rfc3339()});
    sqlx::query("INSERT INTO privacy_consents(tenant,cart_id,channel_id,policy_version,data,expires_at) VALUES($1,$2,$3,$4,$5,now()+make_interval(days=>$6)) ON CONFLICT(tenant,cart_id,channel_id) DO UPDATE SET policy_version=EXCLUDED.policy_version,data=EXCLUDED.data,expires_at=EXCLUDED.expires_at")
      .bind(&c.tenant).bind(&c.id).bind(&c.data.sales_channel).bind(&v.policy_version).bind(&receipt).bind(s.legal.consent_days as i32).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO privacy_consent_log(tenant,cart_id,channel_id,data) VALUES($1,$2,$3,$4)",
    )
    .bind(&c.tenant)
    .bind(&c.id)
    .bind(&c.data.sales_channel)
    .bind(&receipt)
    .execute(&mut *tx)
    .await?;
    if choices.get("personalization") != Some(&true) {
        sqlx::query("DELETE FROM exposures WHERE tenant=$1 AND session=$2")
            .bind(&c.tenant)
            .bind(&c.data.session)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM session_signals WHERE tenant=$1 AND session=$2")
            .bind(&c.tenant)
            .bind(hash(&c.id))
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM session_signal_events WHERE tenant=$1 AND session=$2")
            .bind(&c.tenant)
            .bind(hash(&c.id))
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'privacy.consent_changed',$2)")
        .bind(&c.tenant)
        .bind(json!({"cartId":c.id,"salesChannelId":c.data.sales_channel,"choices":choices}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(receipt))
}
pub(crate) async fn require(a: &App, c: &StoredCart, purpose: &str) -> Result<()> {
    let (s, _) = commerce::scoped_config(a, &c.tenant, &c.data.sales_channel).await?;
    let r=sqlx::query("SELECT policy_version,data,expires_at>now() AS fresh FROM privacy_consents WHERE tenant=$1 AND cart_id=$2 AND channel_id=$3")
      .bind(&c.tenant).bind(&c.id).bind(&c.data.sales_channel).fetch_optional(&a.db).await?;
    let valid = r.is_some_and(|r| {
        verified_kernel::consent_admissible(
            s.legal.purposes.get(purpose) == Some(&true),
            r.get::<String, _>("policy_version") == version(&s.legal),
            r.get::<bool, _>("fresh"),
            r.get::<Value, _>("data")["choices"][purpose] == true,
        )
    });
    if !valid {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Consent required for this purpose".into(),
        ));
    }
    Ok(())
}

/// Public disclosure excludes internal legal-review notes.
fn public_config(c: &Config) -> Value {
    let mut v = json!(c);
    v.as_object_mut().unwrap().remove("operatorNotes");
    v
}
/// Shared receipt lock fences processing against concurrent consent withdrawal.
pub(crate) async fn require_locked(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
    purpose: &str,
) -> Result<()> {
    let (s, _) = commerce::scoped_locked(tx, &c.tenant, &c.data.sales_channel).await?;
    let r=sqlx::query("SELECT policy_version,data,expires_at>now() AS fresh FROM privacy_consents WHERE tenant=$1 AND cart_id=$2 AND channel_id=$3 FOR SHARE")
      .bind(&c.tenant).bind(&c.id).bind(&c.data.sales_channel).fetch_optional(&mut **tx).await?;
    if !r.is_some_and(|r| {
        verified_kernel::consent_admissible(
            s.legal.purposes.get(purpose) == Some(&true),
            r.get::<String, _>("policy_version") == version(&s.legal),
            r.get::<bool, _>("fresh"),
            r.get::<Value, _>("data")["choices"][purpose] == true,
        )
    }) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Consent required for this purpose".into(),
        ));
    }
    Ok(())
}
