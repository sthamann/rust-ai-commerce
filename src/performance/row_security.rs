//! Bind each borrowed PostgreSQL connection to task scope, and reject unsafe strict-runtime roles.
use crate::*;
use sqlx::PgConnection;
use vendune::tenant_scope::{Scope, current};

pub(super) async fn bind(conn: &mut PgConnection) -> std::result::Result<(), sqlx::Error> {
    let (tenant, system) = match current() {
        Scope::Tenant(t) => (t, "off"),
        Scope::System => (String::new(), "on"),
        Scope::Denied => (String::new(), "off"),
    };
    sqlx::query("SELECT set_config('rac.tenant',$1,false),set_config('rac.system',$2,false)")
        .bind(tenant)
        .bind(system)
        .execute(conn)
        .await?;
    Ok(())
}
pub(crate) async fn verify(db: &PgPool) {
    if env::var("DB_RLS_REQUIRED").as_deref() != Ok("true") {
        return;
    }
    assert!(
        env::var("DATABASE_RUNTIME_URL").is_ok(),
        "Strict RLS requires DATABASE_RUNTIME_URL separate from migrations"
    );
    let unsafe_role: bool = sqlx::query_scalar("SELECT r.rolsuper OR r.rolbypassrls OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='core_tenant_scope') AND (pg_has_role(current_user,c.relowner,'MEMBER') OR has_table_privilege(current_user,c.oid,'TRUNCATE'))) FROM pg_roles r WHERE r.rolname=current_user")
        .fetch_one(db).await.expect("runtime role audit");
    assert!(
        !unsafe_role,
        "Runtime role must not own core tables, inherit their owner, or bypass RLS"
    );
    let unprotected: i64 = sqlx::query_scalar("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant' AND NOT a.attisdropped) AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)")
        .fetch_one(db).await.expect("core RLS coverage audit");
    assert_eq!(
        unprotected, 0,
        "Tenant core tables missing FORCE ROW LEVEL SECURITY"
    );
}
