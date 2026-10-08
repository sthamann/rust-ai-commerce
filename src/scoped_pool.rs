//! The commerce database executor: transaction-local tenant scope, including direct queries and cancelled streams.
use crate::tenant_scope::{Scope, current};
use futures_util::{StreamExt, future::BoxFuture, stream::BoxStream};
use sqlx::{
    Describe, Either, Error, Execute, Executor, Postgres, Transaction,
    postgres::{PgQueryResult, PgRow, PgStatement, PgTypeInfo},
};
#[derive(Clone, Debug)]
pub struct ScopedPool {
    pool: sqlx::PgPool,
    transaction_mode: bool,
}
impl ScopedPool {
    pub fn new(pool: sqlx::PgPool, transaction_mode: bool) -> Self {
        Self {
            pool,
            transaction_mode,
        }
    }
    pub fn size(&self) -> u32 {
        self.pool.size()
    }
    pub fn num_idle(&self) -> usize {
        self.pool.num_idle()
    }
    pub async fn close(&self) {
        self.pool.close().await;
    }
    pub async fn begin(&self) -> Result<Transaction<'static, Postgres>, Error> {
        self.pool
            .begin_with(sqlx::AssertSqlSafe(begin_statement(current())?))
            .await
    }
}
fn begin_statement(scope: Scope) -> Result<String, Error> {
    let (tenant, system) = match scope {
        Scope::Tenant(t) => (t, "off"),
        Scope::System => (String::new(), "on"),
        Scope::Denied => (String::new(), "off"),
    };
    // Only a closed identifier alphabet enters this audited multi-statement BEGIN; no caller SQL is interpolated.
    if tenant.len() > 64
        || !tenant
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(Error::Protocol("Invalid database tenant scope".into()));
    }
    Ok(format!(
        "BEGIN; SET LOCAL rac.tenant = '{tenant}'; SET LOCAL rac.system = '{system}'"
    ))
}
impl<'c> Executor<'c> for &'c ScopedPool {
    type Database = Postgres;
    fn fetch_many<'e, 'q: 'e, E>(
        self,
        query: E,
    ) -> BoxStream<'e, Result<Either<PgQueryResult, PgRow>, Error>>
    where
        'c: 'e,
        E: Execute<'q, Postgres> + 'q,
    {
        if !self.transaction_mode {
            return (&self.pool).fetch_many(query);
        }
        Box::pin(async_stream::try_stream! {
            let mut tx=self.begin().await?;
            {
                let mut stream=(&mut *tx).fetch_many(query);
                while let Some(row)=stream.next().await { yield row?; }
            }
            tx.commit().await?;
        })
    }
    fn fetch_optional<'e, 'q: 'e, E>(self, query: E) -> BoxFuture<'e, Result<Option<PgRow>, Error>>
    where
        'c: 'e,
        E: Execute<'q, Postgres> + 'q,
    {
        if !self.transaction_mode {
            return (&self.pool).fetch_optional(query);
        }
        Box::pin(async move {
            let mut tx = self.begin().await?;
            let row = (&mut *tx).fetch_optional(query).await?;
            tx.commit().await?;
            Ok(row)
        })
    }
    fn prepare_with<'e>(
        self,
        sql: sqlx::SqlStr,
        parameters: &'e [PgTypeInfo],
    ) -> BoxFuture<'e, Result<PgStatement, Error>>
    where
        'c: 'e,
    {
        if !self.transaction_mode {
            return (&self.pool).prepare_with(sql, parameters);
        }
        Box::pin(async move {
            let mut tx = self.begin().await?;
            let statement = (&mut *tx).prepare_with(sql, parameters).await?;
            tx.commit().await?;
            Ok(statement)
        })
    }
    fn describe<'e>(self, sql: sqlx::SqlStr) -> BoxFuture<'e, Result<Describe<Postgres>, Error>>
    where
        'c: 'e,
    {
        if !self.transaction_mode {
            return (&self.pool).describe(sql);
        }
        Box::pin(async move {
            let mut tx = self.begin().await?;
            let result = (&mut *tx).describe(sql).await?;
            tx.commit().await?;
            Ok(result)
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn context_literals_have_a_closed_alphabet_and_always_set_local() {
        assert!(begin_statement(Scope::Tenant("a'; SET rac.system='on".into())).is_err());
        let denied = begin_statement(Scope::Denied).unwrap();
        assert!(
            denied.contains("SET LOCAL rac.tenant = ''")
                && denied.contains("SET LOCAL rac.system = 'off'")
        );
    }
}
