//! Tenant-authorized quarantine inspection and explicit retry; delivered or retired events cannot be replayed here.
use crate::{
    App, Error, Json, Path, RequestContext, Result, State, StatusCode, Value, bad, json, merchant,
};
pub(crate) async fn retry(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<i64>,
) -> Result<Json<Value>> {
    let tenant = merchant(&a, &h)?;
    crate::auth::permit(&h, "settings.write")?;
    if id <= 0 {
        return Err(bad("Positive event ID required"));
    }
    let changed=sqlx::query("UPDATE outbox SET attempts=0,available_at=now(),dead_letter_at=NULL,error_code=NULL WHERE tenant=$1 AND id=$2 AND dead_letter_at IS NOT NULL AND delivered_at IS NULL AND payload_retired_at IS NULL")
        .bind(&tenant).bind(id).execute(&a.db).await?.rows_affected();
    if changed == 0 {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Quarantined event not found in this shop".into(),
        ));
    }
    sqlx::query("SELECT pg_notify('vendune_work_ready','outbox')")
        .execute(&a.db)
        .await?;
    Ok(Json(json!({"eventId":id,"queued":true})))
}
