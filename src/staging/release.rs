//! Selected units publish in one transaction with staged digests and live baseline conflict checks.
use super::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Selection {
    key: String,
    digest: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Release {
    approve: bool,
    selections: Vec<Selection>,
}
pub(crate) async fn release(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "users")?;
    let t = live(&a, &h).await?;
    owned(&a, &t, &id).await?;
    let req: Release = serde_json::from_value(v).map_err(|_| bad("Invalid release"))?;
    if !req.approve || req.selections.is_empty() || req.selections.len() > 50 {
        return Err(bad("Select 1..50 reviewed changes and approve"));
    }
    let mut keys = req
        .selections
        .iter()
        .map(|s| s.key.clone())
        .collect::<Vec<_>>();
    keys.sort();
    keys.dedup();
    if keys.len() != req.selections.len() {
        return Err(bad("Duplicate selection"));
    }
    let mut tx = a.db.begin().await?;
    operations::lock_company(&mut tx, &t).await?;
    operations::lock_company(&mut tx, &id).await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,16))")
        .bind(&t)
        .execute(&mut *tx)
        .await?;
    for lock in [726, 727] {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,$2))")
            .bind(&t)
            .bind(lock as i64)
            .execute(&mut *tx)
            .await?;
    }
    for k in keys.iter().filter(|k| k.starts_with("app:")) {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,7))")
            .bind(&k[4..])
            .execute(&mut *tx)
            .await?;
    }
    for key in keys.iter().filter(|k| k.starts_with("appdata:")) {
        let parts = key.splitn(4, ':').collect::<Vec<_>>();
        if parts.len() != 4 {
            return Err(bad("Invalid app data selection"));
        }
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,8))")
            .bind(format!(
                "{t}:{}:{}",
                apps::table(parts[1], parts[2]),
                parts[3]
            ))
            .execute(&mut *tx)
            .await?;
    }
    let mut base: Value = sqlx::query_scalar(
        "SELECT baseline FROM shop_environments WHERE tenant=$1 AND live_tenant=$2 FOR UPDATE",
    )
    .bind(&id)
    .bind(&t)
    .fetch_one(&mut *tx)
    .await?;
    let current = snapshot(&mut tx, &id).await?;
    let actual = snapshot(&mut tx, &t).await?;
    for s in &req.selections {
        let value = current.get(&s.key).ok_or(bad("Unknown change"))?;
        if hash(&value.to_string()) != s.digest || base["stage"].get(&s.key) == Some(value) {
            return Err(conflict("Staged change changed or was already published"));
        }
        if actual.get(&s.key) != base["live"].get(&s.key) {
            return Err(conflict("Live content changed; resolve before release"));
        }
    }
    categories::publish(&mut tx, &t, &current, &keys).await?;
    for key in &keys {
        let s = req.selections.iter().find(|s| s.key == *key).unwrap();
        let value = &current[&s.key];
        if let Some(channel) = s.key.strip_prefix("settings-channel:") {
            auth::permit(&h, "settings.write")?;
            commerce::publish_scope(&mut tx, &t, channel, value).await?;
        } else if s.key == "company" || s.key.starts_with("company-channel:") {
            company::publish(&mut tx, &t, &id, &s.key, value).await?;
        } else if s.key.starts_with("category:") {
            // Category units were published above in parent-first dependency order.
        } else if s.key == "order-workflow" {
            auth::permit(&h, "settings.write")?;
            let m: commerce::OrderMachine =
                serde_json::from_value(value.clone()).map_err(|_| bad("Invalid workflow"))?;
            m.validate()?;
            let ids = m.states.iter().map(|s| s.id.clone()).collect::<Vec<_>>();
            let stranded:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM orders WHERE tenant=$1 AND NOT(data->>'state'=ANY($2)) AND data->>'state' NOT IN ('expired','payment_review'))").bind(&t).bind(ids).fetch_one(&mut *tx).await?;
            if stranded {
                return Err(conflict("Workflow removes an active order state"));
            }
            sqlx::query("INSERT INTO order_state_machines(tenant,data) VALUES($1,$2) ON CONFLICT(tenant) DO UPDATE SET data=EXCLUDED.data,revision=order_state_machines.revision+1").bind(&t).bind(value).execute(&mut *tx).await?;
        } else if s.key.starts_with("asset:") {
            assets::publish_asset(&mut tx, &t, &id, &s.key[6..]).await?;
        } else if s.key.starts_with("document:") {
            documents::publish(&mut tx, &t, &id, &s.key[9..], value).await?;
        } else if s.key.starts_with("product:") {
            product_content(&mut tx, &t, value).await?;
        } else if s.key.starts_with("app:") {
            let m: apps::Manifest = serde_json::from_value(value["manifest"].clone())
                .map_err(|_| bad("Invalid app package"))?;
            if m.runtime != "declarative" {
                return Err(bad("External services need a separate deployment"));
            }
            apps::install_tx(&mut tx, &t, m).await?;
            sqlx::query("UPDATE app_packages SET active=$1 WHERE tenant=$2 AND id=$3")
                .bind(value["active"].as_bool())
                .bind(&t)
                .bind(&s.key[4..])
                .execute(&mut *tx)
                .await?;
        } else if s.key.starts_with("appdata:") {
            let parts = s.key.splitn(4, ':').collect::<Vec<_>>();
            let row = sqlx::query("SELECT manifest FROM app_packages WHERE tenant=$1 AND id=$2")
                .bind(&t)
                .bind(parts[1])
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(bad("Publish the app package before its data"))?;
            let m: apps::Manifest =
                serde_json::from_value(row.get("manifest")).map_err(|_| bad("Invalid app"))?;
            let e = m
                .entities
                .iter()
                .find(|e| e.name == parts[2])
                .ok_or(bad("App entity missing"))?;
            let sql = format!(
                "SELECT revision FROM public.{} WHERE tenant=$1 AND id=$2",
                apps::table(&m.id, &e.name)
            );
            let revision = sqlx::query_scalar::<_, i64>(sqlx::AssertSqlSafe(sql.as_str()))
                .bind(&t)
                .bind(parts[3])
                .fetch_optional(&mut *tx)
                .await?
                .unwrap_or(0);
            let mut fields = value.clone();
            fields.as_object_mut().unwrap().remove("id");
            apps::data::save_tx(
                &mut tx,
                &t,
                &m,
                e,
                &json!({"id":parts[3],"revision":revision,"fields":fields}),
            )
            .await?;
        } else if let Some((kind, unit)) = s.key.split_once(':') {
            let table = match kind {
                "rule" => "commerce_rules",
                "promotion" => "commerce_promotions",
                "flow" => "commerce_flows",
                "channel" => "sales_channels",
                _ => return Err(bad("Unsupported release unit")),
            };
            if kind == "rule" {
                sqlx::query("INSERT INTO commerce_rules(tenant,id,name,condition,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,id) DO UPDATE SET name=EXCLUDED.name,condition=EXCLUDED.condition,active=EXCLUDED.active,revision=commerce_rules.revision+1").bind(&t).bind(unit).bind(&value["name"]).bind(&value["condition"]).bind(value["active"].as_bool()).execute(&mut *tx).await?;
            } else {
                let sql = format!(
                    "INSERT INTO {table}(tenant,id,data) VALUES($1,$2,$3) ON CONFLICT(tenant,id) DO UPDATE SET data=EXCLUDED.data,revision={table}.revision+1"
                );
                sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
                    .bind(&t)
                    .bind(unit)
                    .bind(value)
                    .execute(&mut *tx)
                    .await?;
            }
        } else {
            let table = match s.key.as_str() {
                "settings" => "commerce_settings",
                "experience" => "experiences",
                _ => return Err(bad("Unsupported release unit")),
            };
            let sql = format!("UPDATE {table} SET data=$1,revision=revision+1 WHERE tenant=$2");
            sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
                .bind(value)
                .bind(&t)
                .execute(&mut *tx)
                .await?;
        }
        base["stage"][&s.key] = value.clone();
        base["live"][&s.key] = if s.key == "company" || s.key.starts_with("company-channel:") {
            company::live_value(&mut tx, &t, &s.key).await?
        } else {
            value.clone()
        };
    }
    let release = uid();
    let selected = json!(keys);
    sqlx::query("UPDATE shop_environments SET baseline=$1 WHERE tenant=$2")
        .bind(base)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO shop_releases(id,live_tenant,environment,selections,actor) VALUES($1,$2,$3,$4,$5)").bind(&release).bind(&t).bind(&id).bind(&selected).bind(header(&h,"x-rac-user").unwrap_or("unknown")).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'shop.release.published',$2)")
        .bind(&t)
        .bind(json!({"releaseId":release,"selections":selected}))
        .execute(&mut *tx)
        .await?;
    commerce::validate_settings_release(&mut tx, &t, &actual["settings"]).await?;
    operations::validate_company_release(&mut tx, &t).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":release,"published":selected})))
}
