//! Short, cross-replica conversation leases; inference never retains a database transaction.
use crate::*;
pub(crate) async fn admit(a: &App, t: &str, id: &str) -> Result<String> {
    let owner = uid();
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,2))")
        .bind(t)
        .execute(&mut *tx)
        .await?;
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM conversations WHERE tenant=$1 AND turn_until>now()",
    )
    .bind(t)
    .fetch_one(&mut *tx)
    .await?;
    if count >= 2 {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Two conversations are already running in this shop".into(),
        ));
    }
    let changed=sqlx::query("UPDATE conversations SET turn_owner=$1,turn_until=now()+interval '240 seconds' WHERE tenant=$2 AND id=$3 AND (turn_until IS NULL OR turn_until<now())").bind(&owner).bind(t).bind(id).execute(&mut *tx).await?.rows_affected();
    if changed != 1 {
        return Err(conflict("A turn is already running in this conversation"));
    }
    tx.commit().await?;
    Ok(owner)
}
pub(crate) async fn release(
    a: &App,
    t: &str,
    id: &str,
    owner: &str,
    content: &str,
    data: &Value,
) -> Result<()> {
    let mut tx = a.db.begin().await?;
    let changed=sqlx::query("UPDATE conversations SET turn_owner=NULL,turn_until=NULL WHERE tenant=$1 AND id=$2 AND turn_owner=$3 AND turn_until>now()").bind(t).bind(id).bind(owner).execute(&mut *tx).await?.rows_affected();
    if changed != 1 {
        return Err(conflict("Conversation turn lease expired"));
    }
    sqlx::query("INSERT INTO chat_messages(tenant,conversation_id,role,content,data) VALUES($1,$2,'assistant',$3,$4)").bind(t).bind(id).bind(content).bind(data).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}
