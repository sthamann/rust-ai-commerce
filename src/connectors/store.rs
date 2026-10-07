//! PostgreSQL transactions carry local RLS context; config mutation serializes with in-flight delivery.
use super::*;
use crypto::Crypto;
use sqlx::{Postgres, Transaction};
#[derive(Clone)]
pub struct Store {
    pub pool: PgPool,
    pub crypto: Crypto,
}
pub type Tx<'a> = Transaction<'a, Postgres>;
impl Store {
    pub async fn tx(&self, tenant: &str) -> Result<Tx<'_>> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('rac.tenant',$1,true),set_config('rac.system','off',true),set_config('TimeZone','UTC',true)")
            .bind(tenant)
            .execute(&mut *tx)
            .await?;
        Ok(tx)
    }
    pub async fn system(&self) -> Result<Tx<'_>> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('rac.system','on',true),set_config('rac.tenant','',true),set_config('TimeZone','UTC',true)")
            .execute(&mut *tx)
            .await?;
        Ok(tx)
    }
    pub async fn lock(&self, tx: &mut Tx<'_>, t: &str, a: &str) -> Result<()> {
        let locked: bool =
            sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))")
                .bind(format!("connector:{t}:{a}"))
                .fetch_one(&mut **tx)
                .await?;
        if !locked {
            return Err(Error::Conflict);
        }
        Ok(())
    }
    pub async fn get_tx(&self, tx: &mut Tx<'_>, t: &str, a: &str) -> Result<Value> {
        let row: Option<Vec<u8>> =
            sqlx::query_scalar("SELECT data FROM connector_config WHERE tenant=$1 AND app=$2")
                .bind(t)
                .bind(a)
                .fetch_optional(&mut **tx)
                .await?;
        row.map(|b| self.crypto.open(t, a, &b))
            .unwrap_or(Ok(json!({"revision":0,"settings":{}})))
    }
    pub async fn get(&self, t: &str, a: &str) -> Result<Value> {
        let mut tx = self.tx(t).await?;
        self.get_tx(&mut tx, t, a).await
    }
    pub async fn save(&self, tx: &mut Tx<'_>, t: &str, a: &str, value: &Value) -> Result<()> {
        sqlx::query("INSERT INTO connector_config(tenant,app,data) VALUES($1,$2,$3) ON CONFLICT(tenant,app) DO UPDATE SET data=excluded.data").bind(t).bind(a).bind(self.crypto.seal(t,a,value)?).execute(&mut **tx).await?;
        Ok(())
    }
}
