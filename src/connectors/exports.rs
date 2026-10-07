//! Tenant-scoped encrypted knowledge records and bounded monotonic exports preserve importer fences.
use super::*;
impl Store {
    pub async fn sources(&self, t: &str, a: &str) -> Result<Vec<Value>> {
        let mut tx = self.tx(t).await?;
        let rows=sqlx::query("SELECT data FROM connector_sources WHERE tenant=$1 AND app=$2 ORDER BY updated_at DESC,id LIMIT 2001").bind(t).bind(a).fetch_all(&mut *tx).await?;
        checked(
            rows.len() <= 2000,
            "Connector sources exceed bounded synchronization; narrow provider scope",
        )?;
        rows.iter()
            .map(|r| self.crypto.open(t, a, &r.get::<Vec<u8>, _>("data")))
            .collect()
    }
    pub async fn put_sources(
        &self,
        t: &str,
        a: &str,
        records: &[Value],
        settings: &Value,
        revision: &Value,
        history: Option<&str>,
    ) -> Result<()> {
        let mut tx = self.tx(t).await?;
        self.lock(&mut tx, t, a).await?;
        let mut state = self.get_tx(&mut tx, t, a).await?;
        checked(
            state["settings"] == *settings
                && state["revision"] == *revision
                && state["tokens"].is_object(),
            "Connection or settings changed during import",
        )?;
        for r in records {
            let id = text(r, "id");
            checked(
                !id.is_empty() && id.len() <= 200 && r.to_string().len() <= 50000,
                "Invalid knowledge source",
            )?;
            let old: Option<Vec<u8>> = sqlx::query_scalar(
                "SELECT data FROM connector_sources WHERE tenant=$1 AND app=$2 AND id=$3",
            )
            .bind(t)
            .bind(a)
            .bind(&id)
            .fetch_optional(&mut *tx)
            .await?;
            if old
                .as_ref()
                .is_some_and(|raw| self.crypto.open(t, a, raw).is_ok_and(|v| v == *r))
            {
                continue;
            }
            let sealed = self.crypto.seal(t, a, r)?;
            sqlx::query("INSERT INTO connector_sources(tenant,app,id,data) VALUES($1,$2,$3,$4) ON CONFLICT(tenant,app,id) DO UPDATE SET data=excluded.data,updated_at=now()").bind(t).bind(a).bind(id).bind(&sealed).execute(&mut *tx).await?;
            sqlx::query("INSERT INTO connector_changes(tenant,app,data) VALUES($1,$2,$3)")
                .bind(t)
                .bind(a)
                .bind(sealed)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(history) = history {
            state["historyId"] = json!(history);
            self.save(&mut tx, t, a, &state).await?;
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn exports(&self, t: &str, a: &str, cursor: i64) -> Result<Value> {
        let mut tx = self.tx(t).await?;
        let rows=sqlx::query("SELECT seq,data FROM connector_changes WHERE tenant=$1 AND app=$2 AND seq>$3 ORDER BY seq LIMIT 10").bind(t).bind(a).bind(cursor.max(0)).fetch_all(&mut *tx).await?;
        let mut out = json!({"cursor":cursor.max(0),"sources":[]});
        for r in rows {
            let source = self.crypto.open(t, a, &r.get::<Vec<u8>, _>("data"))?;
            let mut candidate = out.clone();
            candidate["cursor"] = json!(r.get::<i64, _>("seq"));
            candidate["sources"].as_array_mut().unwrap().push(source);
            if candidate.to_string().len() > 60000 {
                checked(
                    !out["sources"].as_array().unwrap().is_empty(),
                    "Single source exceeds export limit",
                )?;
                break;
            }
            out = candidate;
        }
        Ok(out)
    }
    pub async fn purge(&self, tx: &mut store::Tx<'_>, t: &str, a: &str) -> Result<i64> {
        for table in [
            "DELETE FROM connector_sources WHERE tenant=$1 AND app=$2",
            "DELETE FROM connector_changes WHERE tenant=$1 AND app=$2",
            "DELETE FROM connector_jobs WHERE tenant=$1 AND app=$2",
            "DELETE FROM connector_oauth WHERE tenant=$1 AND app=$2",
        ] {
            sqlx::query(table)
                .bind(t)
                .bind(a)
                .execute(&mut **tx)
                .await?;
        }
        Ok(sqlx::query_scalar(
            "INSERT INTO connector_changes(tenant,app,data) VALUES($1,$2,$3) RETURNING seq",
        )
        .bind(t)
        .bind(a)
        .bind(
            self.crypto
                .seal(t, a, &json!({"id":"reset","deleted":true}))?,
        )
        .fetch_one(&mut **tx)
        .await?)
    }
}
