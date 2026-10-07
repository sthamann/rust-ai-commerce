//! Explicit offline SQLite export import: all records are rebound/encrypted atomically; ambiguous jobs stay uncertain.
use super::*;
use tokio::io::AsyncReadExt;
pub async fn import(store: &Store) -> Result<()> {
    let mut raw = vec![];
    tokio::io::stdin()
        .take(64 * 1024 * 1024 + 1)
        .read_to_end(&mut raw)
        .await
        .map_err(|_| Error::Database)?;
    checked(
        raw.len() <= 64 * 1024 * 1024,
        "Legacy export exceeds 64 MiB; split by tenant",
    )?;
    let input: Value =
        serde_json::from_slice(&raw).map_err(|_| Error::Invalid("Invalid legacy export"))?;
    checked(input["format"] == 1, "Unknown legacy export format")?;
    let mut tx = store.system().await?;
    // Require a fresh destination; transaction rollback prevents partial imports or replacement of live state.
    let mut count = 0;
    for row in input["configs"].as_array().into_iter().flatten() {
        let t = text(row, "tenant");
        let a = text(row, "app");
        checked(APPS.contains(&a.as_str()), "Unknown legacy app")?;
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM connector_config WHERE tenant=$1 AND app=$2)",
        )
        .bind(&t)
        .bind(&a)
        .fetch_one(&mut *tx)
        .await?;
        checked(!exists, "Destination config already exists; import refused")?;
        sqlx::query("INSERT INTO connector_config(tenant,app,data) VALUES($1,$2,$3)")
            .bind(&t)
            .bind(&a)
            .bind(store.crypto.seal(&t, &a, &row["value"])?)
            .execute(&mut *tx)
            .await?;
        count += 1;
    }
    for row in input["jobs"].as_array().into_iter().flatten() {
        let t = text(row, "tenant");
        let a = text(row, "app");
        let mut payload = row["payload"].clone();
        payload
            .as_object_mut()
            .ok_or(Error::Invalid("Invalid legacy payload"))?
            .remove("fingerprint");
        sqlx::query(
            "INSERT INTO connector_limits(tenant,app) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(&t)
        .bind(&a)
        .execute(&mut *tx)
        .await?;
        let state = if row["state"] == "running" {
            "uncertain"
        } else {
            row["state"].as_str().unwrap_or("uncertain")
        };
        let result = if row["result"].is_null() {
            None
        } else {
            Some(store.crypto.seal(&t, &a, &row["result"])?)
        };
        sqlx::query("INSERT INTO connector_jobs(tenant,app,id,fingerprint,state,payload,result,available,attempts) VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),$9)").bind(&t).bind(&a).bind(text(row,"id")).bind(digest(payload.to_string().as_bytes())).bind(state).bind(store.crypto.seal(&t,&a,&payload)?).bind(result).bind(row["available"].as_f64().unwrap_or(0.)).bind(row["attempts"].as_i64().unwrap_or(0) as i32).execute(&mut *tx).await?;
    }
    for row in input["sources"].as_array().into_iter().flatten() {
        let t = text(row, "tenant");
        let a = text(row, "app");
        sqlx::query("INSERT INTO connector_sources(tenant,app,id,data) VALUES($1,$2,$3,$4)")
            .bind(&t)
            .bind(&a)
            .bind(text(row, "id"))
            .bind(store.crypto.seal(&t, &a, &row["value"])?)
            .execute(&mut *tx)
            .await?;
    }
    for row in input["changes"].as_array().into_iter().flatten() {
        let t = text(row, "tenant");
        let a = text(row, "app");
        sqlx::query("INSERT INTO connector_changes(seq,tenant,app,data) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4)").bind(row["seq"].as_i64().ok_or(Error::Invalid("Invalid change cursor"))?).bind(&t).bind(&a).bind(store.crypto.seal(&t,&a,&row["value"])?).execute(&mut *tx).await?;
    }
    sqlx::query("SELECT setval(pg_get_serial_sequence('connector_changes','seq'),coalesce((SELECT max(seq) FROM connector_changes),1),EXISTS(SELECT 1 FROM connector_changes))").execute(&mut *tx).await?;
    tx.commit().await?;
    println!(
        "Imported {count} configurations; running jobs became uncertain; OAuth must be restarted"
    );
    Ok(())
}
