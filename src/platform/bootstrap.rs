//! Offline first-operator setup: migration-only process, supplied strong credentials, password proof for existing accounts.
use crate::*;
pub(crate) async fn bootstrap_operator() {
    assert_eq!(
        env::var("BOOTSTRAP_MODE").as_deref(),
        Ok("migrate"),
        "Operator setup requires BOOTSTRAP_MODE=migrate"
    );
    let v = json!({"email":env::var("PLATFORM_ADMIN_EMAIL").expect("PLATFORM_ADMIN_EMAIL required"),"password":env::var("PLATFORM_ADMIN_PASSWORD").expect("PLATFORM_ADMIN_PASSWORD required"),"name":env::var("PLATFORM_ADMIN_NAME").unwrap_or("Platform operator".into())});
    let email = auth::email(&v).expect("Valid operator email");
    let password = auth::password(&v).expect("Strong operator password required");
    let name = auth::name(&v).expect("Valid operator name");
    let a = crate::bootstrap::bootstrap().await;
    let mut tx = a.db.begin().await.expect("Operator transaction");
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,29))")
        .bind(&email)
        .execute(&mut *tx)
        .await
        .expect("Operator setup lock");
    let existing = sqlx::query("SELECT id,password_hash FROM merchant_users WHERE email=$1")
        .bind(&email)
        .fetch_optional(&mut *tx)
        .await
        .expect("Operator lookup");
    let user = if let Some(row) = existing {
        assert!(
            auth::verify_password(password, row.get("password_hash"))
                .await
                .expect("Password validation"),
            "Existing account password does not match; no operator grant applied"
        );
        row.get::<String, _>("id")
    } else {
        let user = uid();
        let saved = auth::hash_password(password)
            .await
            .expect("Operator password hashing");
        sqlx::query("INSERT INTO merchant_users(id,email,name,password_hash) VALUES($1,$2,$3,$4)")
            .bind(&user)
            .bind(&email)
            .bind(name)
            .bind(saved)
            .execute(&mut *tx)
            .await
            .expect("Operator account");
        let slug = format!("operator-{}", &user[..12]);
        auth::provision_shop(
            &mut tx,
            &user,
            &slug,
            "Operator workspace",
            String::new(),
            false,
            false,
        )
        .await
        .expect("Operator workspace");
        user
    };
    sqlx::query("INSERT INTO platform_operators(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET active=true").bind(&user).execute(&mut *tx).await.expect("Operator grant");
    sqlx::query("INSERT INTO platform_audit(actor,action,data) VALUES($1,'operator.bootstrap',jsonb_build_object('userId',$1::text))").bind(&user).execute(&mut *tx).await.expect("Operator audit");
    tx.commit().await.expect("Operator setup commit");
    println!(
        "Personal operator ready. Sign in at /#platform. No browser/admin token was generated or published."
    );
}
