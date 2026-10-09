//! Delayed final experiment readout is derived from the existing live capture/refund ledger, never demo rewards.
use super::*;
pub(super) async fn report(a: &App, t: &str, id: &str) -> Result<Value> {
    let mut tx = a.db.begin().await?;
    let r=sqlx::query("SELECT data,state,withdrawn,final_report,(now()>=ends_at+((data->>'settlementDays')::integer*interval '1 day')) AS settled FROM intelligence_experiments WHERE tenant=$1 AND id=$2 FOR UPDATE").bind(t).bind(id).fetch_optional(&mut *tx).await?.ok_or(bad("Experiment not found"))?;
    let d: Design =
        serde_json::from_value(r.get("data")).map_err(|_| bad("Invalid experiment design"))?;
    let state: String = r.get("state");
    let withdrawn: i32 = r.get("withdrawn");
    let settled: Option<bool> = r.get("settled");
    let cached: Option<Value> = r.get("final_report");
    if let Some(mut cached) = cached {
        if withdrawn > 0 || state == "stopped" {
            cached["causalUpliftProven"] = json!(false);
            cached["withdrawals"] = json!(withdrawn);
            cached["stoppedEarly"] = json!(state == "stopped");
            cached["finalLook"] = json!(false);
            cached["interval95"] = Value::Null;
        }
        tx.commit().await?;
        return Ok(cached);
    }
    let rows = sqlx::query(include_str!("report.sql"))
        .bind(t)
        .bind(id)
        .bind(&d.currency)
        .fetch_all(&mut *tx)
        .await?;
    let invalid = rows.iter().any(|r| r.get::<bool, _>("invalid_currency"));
    let values = rows
        .iter()
        .map(|r| {
            let net: i64 = r.get("net_minor");
            let baseline: f64 = r.get("baseline");
            (
                r.get::<i32, _>("arm") as usize,
                net.clamp(0, d.outcome_cap_minor) as f64 / d.outcome_cap_minor as f64
                    - d.cuped_theta * baseline,
            )
        })
        .collect::<Vec<_>>();
    let mature = settled == Some(true)
        && state != "draft"
        && state != "stopped"
        && withdrawn == 0
        && !invalid;
    let mut result = model::interval(&values, mature, d.minimum_per_arm, d.cuped_theta);
    result["id"] = json!(id);
    result["currency"] = json!(d.currency);
    result["currencyScale"] = json!(currencies::scale(&d.currency));
    result["withdrawals"] = json!(withdrawn);
    result["settled"] = json!(settled == Some(true));
    result["stoppedEarly"] = json!(state == "stopped");
    result["invalidCurrency"] = json!(invalid);
    result["netCollectedMinor"] = json!(
        rows.iter()
            .map(|r| i128::from(r.get::<i64, _>("net_minor")))
            .sum::<i128>()
            .to_string()
    );
    result["asOf"] = json!(chrono::Utc::now().to_rfc3339());
    if mature {
        sqlx::query(
            "UPDATE intelligence_experiments SET final_report=$3 WHERE tenant=$1 AND id=$2",
        )
        .bind(t)
        .bind(id)
        .bind(&result)
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO knowledge_relations(tenant,kind,source_kind,source_id,target_kind,target_id,state,confidence,data,actor) VALUES($1,'EXPERIMENT_RESULT','experiment',$2,'channel',$3,'evidenced',1,$4,'native-payment-readout') ON CONFLICT(tenant,kind,source_id,target_id) DO UPDATE SET data=excluded.data").bind(t).bind(id).bind(&d.channel).bind(&result).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'intelligence.experiment.result',$2)").bind(t).bind(json!({"id":id,"channelId":d.channel,"causalUpliftProven":result["causalUpliftProven"],"asOf":result["asOf"]})).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(result)
}
