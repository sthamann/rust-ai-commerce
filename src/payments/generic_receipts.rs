//! Provider-neutral receipt admission and atomic allocation; verified evidence owns ledger transitions.
use super::*;
pub(super) fn identity(p: &Attempt, v: &Value) -> Result<()> {
    if v["apiVersion"] != "1"
        || v["provider"] != p.provider
        || v["adapterVersion"] != p.adapter_version
        || v["tenant"] != p.tenant
        || v["attemptId"] != p.id
        || v["orderId"] != p.order
        || v["environment"] != p.environment
        || v["accountRef"] != p.context["accountRef"]
        || v["currency"] != p.currency
        || v["amountMinor"].as_i64() != Some(p.amount)
        || p.provider_order
            .as_ref()
            .is_some_and(|r| v["reference"] != *r)
    {
        return Err(bad("Payment receipt identity, account or invoice mismatch"));
    }
    Ok(())
}
fn reference(v: &Value) -> Result<&str> {
    v.as_str()
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 200
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-:.".contains(&b))
        })
        .ok_or(bad("Invalid provider receipt reference"))
}
async fn claim(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    p: &Attempt,
    kind: &str,
    id: &str,
    key: &str,
) -> Result<()> {
    sqlx::query("INSERT INTO payment_receipt_claims(provider,environment,account_ref,kind,receipt_ref,tenant,attempt_id,job_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING").bind(&p.provider).bind(&p.environment).bind(p.context["accountRef"].as_str().unwrap_or("")).bind(kind).bind(id).bind(&p.tenant).bind(&p.id).bind(key).execute(&mut **tx).await?;
    let row=sqlx::query("SELECT tenant,attempt_id,job_key FROM payment_receipt_claims WHERE provider=$1 AND environment=$2 AND account_ref=$3 AND kind=$4 AND receipt_ref=$5 FOR UPDATE").bind(&p.provider).bind(&p.environment).bind(p.context["accountRef"].as_str().unwrap_or("")).bind(kind).bind(id).fetch_one(&mut **tx).await?;
    if row.get::<String, _>("tenant") != p.tenant
        || row.get::<String, _>("attempt_id") != p.id
        || (kind == "refund" && row.get::<String, _>("job_key") != key)
    {
        return Err(conflict("Provider receipt already allocated"));
    }
    Ok(())
}
pub(crate) async fn persist(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    p: &Attempt,
    op: &str,
    input: &Value,
    v: &Value,
) -> Result<()> {
    identity(p, v)?;
    let remote = reference(&v["reference"])?;
    let status = v["status"].as_str().ok_or(bad("Payment status required"))?;
    let mut state = p.state.clone();
    let mut capture = p.capture.clone();
    let mut refunded = p.refunded;
    let mut context = p.context.clone();
    let url = remote::approval_url(p, &v["approvalUrl"])?;
    if op == "refund" {
        let amount = input["amountMinor"]
            .as_i64()
            .filter(|n| *n > 0)
            .ok_or(bad("Refund amount required"))?;
        if status == "refund_pending" {
            return Err(Error(
                StatusCode::ACCEPTED,
                "Provider refund pending".into(),
            ));
        }
        if status != "refunded"
            || v["refund"]["amountMinor"].as_i64() != Some(amount)
            || v["refund"]["currency"] != p.currency
            || v["confirmed"] != true
        {
            return Err(bad("Refund receipt mismatch"));
        }
        let refund = reference(&v["refund"]["id"])?;
        let key = input["ledgerJobKey"]
            .as_str()
            .ok_or(bad("Refund ledger job required"))?;
        claim(tx, p, "refund", refund, key).await?;
        refunded = refunded
            .checked_add(amount)
            .filter(|n| *n <= p.amount)
            .ok_or(conflict("Refund exceeds payment"))?;
        state = if refunded == p.amount {
            "refunded"
        } else {
            "partially_refunded"
        }
        .into();
    } else if status == "captured" {
        if !receipt_matches(
            p.amount,
            &json!({"value":amount_string(v["settledAmountMinor"].as_i64().ok_or(bad("Settled amount missing"))?),"currency_code":v["currency"]}),
            &p.currency,
            v["confirmed"] == true,
        )? {
            return Err(bad("Unconfirmed or mismatched settlement"));
        }
        let id = reference(&v["captureId"])?;
        claim(tx, p, "capture", id, "").await?;
        if p.capture.as_ref().is_some_and(|old| old != id) {
            return Err(conflict("Capture receipt changed"));
        }
        capture = Some(id.into());
        if ["pending", "ready", "approved", "authorized"].contains(&p.state.as_str()) {
            state = "captured".into();
        } else if ["cancelled", "expired"].contains(&p.state.as_str()) {
            state = "captured_late".into();
        }
    } else if status == "authorized" {
        if v["confirmed"] != true || v["authorizedAmountMinor"].as_i64() != Some(p.amount) {
            return Err(bad("Authorization receipt mismatch"));
        }
        if !p.context["capabilities"]
            .as_array()
            .is_some_and(|cs| cs.iter().any(|c| c == "authorize"))
        {
            return Err(bad("Method does not support authorization"));
        }
        let id = reference(&v["authorizationId"])?;
        claim(tx, p, "authorization", id, "").await?;
        context["authorizationId"] = json!(id);
        if ["pending", "ready", "approved"].contains(&p.state.as_str()) {
            state = "authorized".into();
        }
    } else if ["cancelled", "voided"].contains(&status) {
        if v["confirmed"] != true || !["cancel", "void", "reconcile"].contains(&op) {
            return Err(bad("Cancellation requires verified provider confirmation"));
        }
        if p.state == "authorized" && status != "voided" {
            return Err(conflict("Void authorization before releasing stock"));
        }
        return release_stock(
            tx,
            p,
            if input["expiry"] == true {
                "expired"
            } else {
                "cancelled"
            },
            status == "voided" && v["confirmed"] == true,
        )
        .await;
    } else if ["pending", "ready", "approved"].contains(&status) {
        if status == "approved" && v["confirmed"] != true {
            return Err(bad("Approval must be server verified"));
        }
        if ["pending", "ready", "approved"].contains(&p.state.as_str()) {
            let ranks = ["pending", "ready", "approved"];
            if ranks.iter().position(|v| *v == status) >= ranks.iter().position(|v| *v == p.state) {
                state = status.into();
            }
        }
    } else {
        return Err(bad("Unsupported provider receipt state"));
    }
    sqlx::query("UPDATE payment_attempts SET state=$1,provider_order=$2,approval_url=coalesce($3,approval_url),capture_id=$4,refunded_minor=$5,provider_context=$6,revision=revision+1 WHERE tenant=$7 AND id=$8").bind(&state).bind(remote).bind(url).bind(capture).bind(refunded).bind(context).bind(&p.tenant).bind(&p.id).execute(&mut **tx).await?;
    if state != p.state {
        if state == "approved" || (state == "authorized" && p.context["intent"] == "capture") {
            let op = if p.context["intent"] == "authorize" {
                "authorize"
            } else {
                "capture"
            };
            enqueue_tx(
                tx,
                &p.tenant,
                &p.id,
                op,
                &format!("approved:{}", p.id),
                &json!({}),
            )
            .await?;
        }
        update_order(tx, p, &state).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_receipt_is_bound_to_its_original_account_and_invoice() {
        let p = Attempt {
            id: "a".into(),
            provider: "example".into(),
            context: json!({"accountRef":"merchant"}),
            tenant: "shop".into(),
            order: "o".into(),
            amount: 123,
            currency: "EUR".into(),
            state: "ready".into(),
            provider_order: Some("remote".into()),
            capture: None,
            refunded: 0,
            adapter_version: "1.0.0".into(),
            environment: "sandbox".into(),
            bn_code: "".into(),
        };
        let v = json!({"apiVersion":"1","provider":"example","adapterVersion":"1.0.0","tenant":"shop","attemptId":"a","orderId":"o","environment":"sandbox","accountRef":"merchant","currency":"EUR","amountMinor":123,"reference":"remote"});
        assert!(identity(&p, &v).is_ok());
        for key in [
            "apiVersion",
            "provider",
            "adapterVersion",
            "tenant",
            "attemptId",
            "orderId",
            "environment",
            "accountRef",
            "currency",
            "amountMinor",
            "reference",
        ] {
            let mut wrong = v.clone();
            wrong[key] = json!("foreign");
            assert!(identity(&p, &wrong).is_err(), "{key}");
        }
        assert!(reference(&json!("../unsafe")).is_err());
    }
}
