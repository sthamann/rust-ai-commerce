//! Persisted storefront layout policy and observed synthetic rewards.
use crate::*;

pub(crate) async fn experience(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let session = v["session"]
        .as_str()
        .filter(|s| s.len() >= 8 && s.len() <= 128)
        .ok_or(bad("Session ID required"))?;
    let er = sqlx::query("SELECT data,revision FROM experiences WHERE tenant=$1")
        .bind(&t)
        .fetch_one(&a.db)
        .await?;
    let e: Value = er.get("data");
    let mut tx = a.db.begin().await?;
    let existing =
        sqlx::query("SELECT variant,propensity FROM exposures WHERE tenant=$1 AND session=$2")
            .bind(&t)
            .bind(session)
            .fetch_optional(&mut *tx)
            .await?;
    let (variant, probability) = if let Some(r) = existing {
        (r.get::<String, _>("variant"), r.get::<f64, _>("propensity"))
    } else {
        let rows = sqlx::query(
            "SELECT variant,views,purchases FROM policy WHERE tenant=$1 ORDER BY variant",
        )
        .bind(&t)
        .fetch_all(&mut *tx)
        .await?;
        let best = rows
            .iter()
            .max_by(|x, y| {
                let rate = |r: &sqlx::postgres::PgRow| {
                    (r.get::<i64, _>("purchases") as f64 + 1.)
                        / (r.get::<i64, _>("views") as f64 + 2.)
                };
                rate(x).total_cmp(&rate(y))
            })
            .map(|r| r.get::<String, _>("variant"))
            .unwrap_or("discovery".into());
        let digest = Sha256::digest(session.as_bytes());
        let explore = digest[0] < 51;
        let random = if digest[1] % 2 == 0 {
            "discovery"
        } else {
            "comparison"
        };
        let chosen = if e["mode"] == "balanced" {
            if explore {
                random.to_string()
            } else {
                best.clone()
            }
        } else {
            e["mode"].as_str().unwrap().to_string()
        };
        let epsilon = 51.0 / 256.0;
        let p = if e["mode"] != "balanced" {
            1.
        } else if chosen == best {
            1.0 - epsilon / 2.0
        } else {
            epsilon / 2.0
        };
        let n=sqlx::query("INSERT INTO exposures(tenant,session,variant,propensity) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(&t).bind(session).bind(&chosen).bind(p).execute(&mut *tx).await?.rows_affected();
        if n == 1 {
            sqlx::query("UPDATE policy SET views=views+1 WHERE tenant=$1 AND variant=$2")
                .bind(&t)
                .bind(&chosen)
                .execute(&mut *tx)
                .await?;
        }
        let saved =
            sqlx::query("SELECT variant,propensity FROM exposures WHERE tenant=$1 AND session=$2")
                .bind(&t)
                .bind(session)
                .fetch_one(&mut *tx)
                .await?;
        (saved.get("variant"), saved.get("propensity"))
    };
    tx.commit().await?;
    Ok(Json(
        json!({"schemaVersion":1,"revision":er.get::<i64,_>("revision"),"variant":variant,"propensity":probability,"headline":e["headline"],"blocks":[{"type":"hero"},{"type":if variant=="comparison"{"comparison-grid"}else{"product-grid"}},{"type":"cart"}],"adaptation":{"localBehavior":true,"policy":"persisted epsilon-greedy; simulated purchase reward"}}),
    ))
}
pub(crate) async fn policy_stats(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rs = sqlx::query("SELECT * FROM policy WHERE tenant=$1 ORDER BY variant")
        .bind(t)
        .fetch_all(&a.db)
        .await?;
    Ok(Json(
        json!({"variants":rs.iter().map(|r|json!({"variant":r.get::<String,_>("variant"),"views":r.get::<i64,_>("views"),"purchases":r.get::<i64,_>("purchases")})).collect::<Vec<_>>()}),
    ))
}
