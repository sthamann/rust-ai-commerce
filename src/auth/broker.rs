//! Optional trusted identity exchange: signatures bind route, audience, expiry and one-use nonce.
use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};

pub(crate) async fn assertion(a: &App, route: &str, v: &Value) -> Result<Value> {
    let key = env::var("IDENTITY_BROKER_KEY")
        .ok()
        .filter(|k| k.len() >= 64)
        .ok_or(Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Identity broker is not configured".into(),
        ))?;
    let issuer =
        env::var("IDENTITY_BROKER_ISSUER").map_err(|_| bad("Identity issuer is not configured"))?;
    let limit = if route == "/api/identity/inference" {
        8_100_000
    } else {
        32000
    };
    let encoded = v["payload"]
        .as_str()
        .filter(|s| s.len() <= limit)
        .ok_or(bad("Invalid identity assertion"))?;
    let signature = URL_SAFE_NO_PAD
        .decode(v["signature"].as_str().unwrap_or(""))
        .map_err(|_| bad("Invalid assertion signature"))?;
    let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes())
        .map_err(|_| bad("Invalid broker configuration"))?;
    mac.update(format!("{route}\n{encoded}").as_bytes());
    mac.verify_slice(&signature).map_err(|_| {
        Error(
            StatusCode::UNAUTHORIZED,
            "Invalid identity assertion".into(),
        )
    })?;
    let claims: Value = serde_json::from_slice(
        &URL_SAFE_NO_PAD
            .decode(encoded)
            .map_err(|_| bad("Invalid assertion encoding"))?,
    )
    .map_err(|_| bad("Invalid identity payload"))?;
    let now = chrono::Utc::now().timestamp();
    if claims["iss"] != issuer
        || claims["aud"] != "vendune-identity"
        || claims["verified"] != true
        || !claims["exp"]
            .as_i64()
            .is_some_and(|e| e > now && e <= now + 60)
        || !claims["iat"]
            .as_i64()
            .is_some_and(|i| i <= now + 5 && i >= now - 60)
        || !claims["nonce"]
            .as_str()
            .is_some_and(|n| n.len() == 64 && n.bytes().all(|c| c.is_ascii_hexdigit()))
    {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "Expired or invalid identity assertion".into(),
        ));
    }
    email(&claims)?;
    if !claims["sub"]
        .as_str()
        .is_some_and(|s| !s.is_empty() && s.len() <= 200)
    {
        return Err(bad("Identity subject required"));
    }
    sqlx::query("DELETE FROM identity_nonces WHERE expires_at<now()")
        .execute(&a.db)
        .await?;
    let used=sqlx::query("INSERT INTO identity_nonces(digest,expires_at) VALUES($1,now()+interval '2 minutes') ON CONFLICT DO NOTHING")
        .bind(hash(&format!("{}:{}",issuer,claims["nonce"].as_str().unwrap()))).execute(&a.db).await?.rows_affected();
    if used == 0 {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "Identity assertion already consumed".into(),
        ));
    }
    Ok(claims)
}

pub(crate) async fn exchange(State(a): State<App>, Json(v): Json<Value>) -> Result<Json<Value>> {
    let c = assertion(&a, "/api/identity/exchange", &v).await?;
    let issuer = c["iss"].as_str().unwrap();
    let subject = c["sub"].as_str().unwrap();
    let email = email(&c)?;
    let name = c["name"]
        .as_str()
        .filter(|n| !n.trim().is_empty() && n.len() <= 100)
        .ok_or(bad("Merchant name required"))?;
    let shop = c["workspaceId"].as_str().ok_or(bad("Shop ID required"))?;
    validate_tenant(shop)?;
    let shop_name = c["workspaceName"]
        .as_str()
        .filter(|n| !n.trim().is_empty() && n.len() <= 100)
        .ok_or(bad("Shop name required"))?;
    let random_password = hash_password(format!("{}{}", uid(), uid())).await?;
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,42))")
        .bind(&email)
        .execute(&mut *tx)
        .await?;
    // Only the configured broker can assert verified ownership of this email; arbitrary clients cannot link accounts.
    let user: String=sqlx::query_scalar("INSERT INTO merchant_users(id,email,name,password_hash,password_initialized) VALUES($1,$2,$3,$4,false) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id")
        .bind(uid()).bind(&email).bind(name).bind(random_password).fetch_one(&mut *tx).await?;
    let linked: Option<String> = sqlx::query_scalar(
        "SELECT user_id FROM merchant_identities WHERE issuer=$1 AND subject=$2",
    )
    .bind(issuer)
    .bind(subject)
    .fetch_optional(&mut *tx)
    .await?;
    if linked.as_ref().is_some_and(|u| u != &user) {
        return Err(conflict(
            "Identity email changed; explicit account recovery required",
        ));
    }
    sqlx::query("INSERT INTO merchant_identities(issuer,subject,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING").bind(issuer).bind(subject).bind(&user).execute(&mut *tx).await?;
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1)")
        .bind(shop)
        .fetch_one(&mut *tx)
        .await?;
    let mut sandbox = None;
    let mut seeded = false;
    if exists {
        let owned:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM memberships WHERE tenant=$1 AND user_id=$2 AND role='owner' AND active)").bind(shop).bind(&user).fetch_one(&mut *tx).await?;
        if !owned {
            return Err(conflict("Shop address already exists"));
        }
    } else {
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM memberships WHERE user_id=$1 AND role='owner' AND active",
        )
        .bind(&user)
        .fetch_one(&mut *tx)
        .await?;
        if count >= 20 {
            return Err(bad("Maximum 20 owned shops per account"));
        }
        seeded = c["demoCatalog"] == true;
        sandbox = Some(
            provision_shop(
                &mut tx,
                &user,
                shop,
                shop_name,
                String::new(),
                c["demoCatalog"] == true,
                false,
            )
            .await?,
        );
    }
    tx.commit().await?;
    if let Some(sandbox) = sandbox {
        a.sandboxes
            .write()
            .unwrap()
            .insert(shop.into(), Arc::new(sandbox));
    }
    if seeded {
        for p in prototype_products(&a, shop).await? {
            knowledge::sync_product(&mut *a.db.acquire().await?, shop, &json!(p)).await?;
        }
        knowledge::seed_relations(&a.db, shop).await?;
    }
    Ok(Json(issue_session(&a, &user, shop).await?))
}
