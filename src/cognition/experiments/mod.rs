//! Controlled experiments use the existing storefront layout consumer and authoritative payment ledger.
use crate::*;
mod model;
mod report;
use model::Design;
pub(crate) async fn invoke(a: &App, h: &RequestContext, name: &str, v: &Value) -> Result<Value> {
    let t = merchant(a, h)?;
    auth::permit(h, "knowledge.read")?;
    if name == "knowledge.experiments" {
        let rows=sqlx::query("SELECT id,data,revision,state,started_at::text,ends_at::text FROM intelligence_experiments WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(&t).fetch_all(&a.db).await?;
        return Ok(
            json!({"experiments":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"design":r.get::<Value,_>("data"),"revision":r.get::<i64,_>("revision"),"state":r.get::<String,_>("state"),"startedAt":r.get::<Option<String>,_>("started_at"),"endsAt":r.get::<Option<String>,_>("ends_at")})).collect::<Vec<_>>() }),
        );
    }
    if name == "knowledge.experiment.report" {
        return report::report(a, &t, v["id"].as_str().ok_or(bad("Experiment required"))?).await;
    }
    auth::permit(h, "settings.write")?;
    if v["approve"] != true {
        return Err(bad("Explicit approve=true required"));
    }
    let actor = header(h, "x-rac-user").unwrap_or("integration");
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,24))")
        .bind(&t)
        .execute(&mut *tx)
        .await?;
    let id = if name == "knowledge.experiment.create" {
        let design: Design = serde_json::from_value(v["design"].clone())
            .map_err(|_| bad("Invalid experiment design"))?;
        design.validate()?;
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM intelligence_experiments WHERE tenant=$1")
                .bind(&t)
                .fetch_one(&mut *tx)
                .await?;
        if count >= 100 {
            return Err(bad("Experiment history limit reached"));
        }
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM sales_channels WHERE tenant=$1 AND id=$2)",
        )
        .bind(&t)
        .bind(&design.channel)
        .fetch_one(&mut *tx)
        .await?;
        if !exists {
            return Err(bad("Channel does not belong to shop"));
        }
        let settings = commerce::config(a, &t).await?.0;
        if !settings.currencies.enabled.contains(&design.currency) {
            return Err(bad("Experiment currency is not enabled"));
        }
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO intelligence_experiments(tenant,id,channel,data,state,actor) VALUES($1,$2,$3,$4,'draft',$5)").bind(&t).bind(&id).bind(&design.channel).bind(json!(design)).bind(actor).execute(&mut *tx).await?;
        id
    } else {
        let id = v["id"].as_str().ok_or(bad("Experiment required"))?;
        let r=sqlx::query("SELECT data,revision,state FROM intelligence_experiments WHERE tenant=$1 AND id=$2 FOR UPDATE").bind(&t).bind(id).fetch_optional(&mut *tx).await?.ok_or(bad("Experiment not found"))?;
        if v["revision"].as_i64() != Some(r.get("revision")) {
            return Err(conflict("Experiment revision changed"));
        }
        let state: String = r.get("state");
        if name == "knowledge.experiment.start" && state == "draft" {
            let d: Design = serde_json::from_value(r.get("data"))
                .map_err(|_| bad("Invalid stored experiment"))?;
            d.validate()?;
            let active:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM intelligence_experiments WHERE tenant=$1 AND channel=$2 AND state='running')").bind(&t).bind(&d.channel).fetch_one(&mut *tx).await?;
            if active {
                return Err(conflict("A channel experiment is already running"));
            }
            sqlx::query("UPDATE intelligence_experiments SET state='running',started_at=now(),ends_at=now()+($3*interval '1 hour'),revision=revision+1 WHERE tenant=$1 AND id=$2").bind(&t).bind(id).bind(d.duration_hours as f64).execute(&mut *tx).await?;
        } else if name == "knowledge.experiment.finish" && state == "running" {
            let elapsed: bool = sqlx::query_scalar(
                "SELECT ends_at<=now() FROM intelligence_experiments WHERE tenant=$1 AND id=$2",
            )
            .bind(&t)
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
            if !elapsed {
                return Err(conflict("Preregistered horizon has not elapsed"));
            }
            sqlx::query("UPDATE intelligence_experiments SET state='completed',revision=revision+1 WHERE tenant=$1 AND id=$2").bind(&t).bind(id).execute(&mut *tx).await?;
        } else if name == "knowledge.experiment.stop" && state == "running" {
            sqlx::query("UPDATE intelligence_experiments SET state='stopped',revision=revision+1 WHERE tenant=$1 AND id=$2").bind(&t).bind(id).execute(&mut *tx).await?;
            sqlx::query("UPDATE knowledge_relations SET data=jsonb_set(jsonb_set(jsonb_set(data,'{causalUpliftProven}','false'),'{interval95}','null'),'{stoppedEarly}','true') WHERE tenant=$1 AND kind='EXPERIMENT_RESULT' AND source_id=$2").bind(&t).bind(id).execute(&mut *tx).await?;
        } else {
            return Err(bad(
                "Invalid experiment transition; design is immutable after registration",
            ));
        }
        id.to_owned()
    };
    sqlx::query(
        "INSERT INTO outbox(tenant,kind,data) VALUES($1,'intelligence.experiment.changed',$2)",
    )
    .bind(&t)
    .bind(json!({"id":id,"operation":name,"actor":actor}))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(json!({"id":id,"saved":true}))
}
/// Called only inside the native consent-locked experience transaction. Never overrides non-consenting layouts.
pub(crate) async fn assign(
    a: &App,
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
) -> Result<Option<Value>> {
    let r=sqlx::query("SELECT id,data FROM intelligence_experiments WHERE tenant=$1 AND channel=$2 AND state='running' AND ends_at>now() FOR UPDATE").bind(&c.tenant).bind(&c.data.sales_channel).fetch_optional(&mut **tx).await?;
    let Some(r) = r else { return Ok(None) };
    let id: String = r.get("id");
    let d: Design =
        serde_json::from_value(r.get("data")).map_err(|_| bad("Invalid stored experiment"))?;
    if c.status != "open" || c.data.currency != d.currency {
        return Ok(None);
    };
    let total: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM intelligence_assignments WHERE tenant=$1 AND experiment_id=$2",
    )
    .bind(&c.tenant)
    .bind(&id)
    .fetch_one(&mut **tx)
    .await?;
    let saved:Option<i32>=sqlx::query_scalar("SELECT arm FROM intelligence_assignments WHERE tenant=$1 AND experiment_id=$2 AND cart_id=$3").bind(&c.tenant).bind(&id).bind(&c.id).fetch_optional(&mut **tx).await?;
    let arm = if let Some(arm) = saved {
        arm
    } else {
        if total >= 10000 {
            return Ok(None);
        };
        let secret = env::var("PLATFORM_SECRET_KEY").unwrap_or_else(|_| a.token.to_string());
        let key = ring::hmac::Key::new(ring::hmac::HMAC_SHA256, secret.as_bytes());
        let arm = i32::from(
            ring::hmac::sign(&key, format!("{}:{}:{}", c.tenant, id, c.id).as_bytes()).as_ref()[0]
                % 2,
        );
        let baseline:i64=sqlx::query_scalar("SELECT coalesce(sum(views),0)::bigint FROM session_signals WHERE tenant=$1 AND session=$2").bind(&c.tenant).bind(hash(&c.id)).fetch_one(&mut **tx).await?;
        sqlx::query("INSERT INTO intelligence_assignments(tenant,experiment_id,cart_id,arm,baseline) VALUES($1,$2,$3,$4,$5)").bind(&c.tenant).bind(&id).bind(&c.id).bind(arm).bind(baseline.clamp(0,1000) as f64/1000.0).execute(&mut **tx).await?;
        arm
    };
    Ok(Some(
        json!({"variant":if arm==0{d.control}else{d.treatment},"propensity":0.5,"experimentId":id,"arm":arm,"adaptation":{"localBehavior":true,"policy":"randomized fixed-horizon experiment; no adaptive reward"}}),
    ))
}
