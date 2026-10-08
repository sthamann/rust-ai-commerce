//! Tenant-scoped dependency preflight and authoritative deletion guards; order snapshots remain immutable.
use super::*;
async fn counts(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    area: &str,
    id: &str,
    channel: Option<&str>,
) -> Result<Value> {
    let (selection, snapshot) = if area == "shipping" {
        ("shippingMethodId", vec!["cart", "shippingMethod", "id"])
    } else if area == "payments" {
        ("paymentMethodId", vec!["payment", "method", "id"])
    } else {
        return Err(bad("Unknown method area"));
    };
    let orders:i64=sqlx::query_scalar("SELECT count(*) FROM orders o JOIN carts c ON c.id=o.cart_id WHERE o.tenant=$1 AND ($4::text IS NULL OR COALESCE(c.data->>'sales_channel','default')=$4) AND (o.data #>> $2::text[]=$3 OR o.data->'cart'->'checkout'->>$5=$3)")
        .bind(t).bind(snapshot).bind(id).bind(channel).bind(selection).fetch_one(&mut **tx).await?;
    let carts:i64=sqlx::query_scalar("SELECT count(*) FROM carts WHERE tenant=$1 AND status='open' AND ($4::text IS NULL OR COALESCE(data->>'sales_channel','default')=$4) AND (data->'checkout'->>$2=$3 OR data->'checkout'->>$5=$3)")
        .bind(t).bind(selection).bind(id).bind(channel).bind(if area=="shipping"{"shipping_method_id"}else{"payment_method_id"}).fetch_one(&mut **tx).await?;
    let overrides: i64 = if channel.is_none() {
        sqlx::query_scalar("SELECT count(*) FROM commerce_overrides WHERE tenant=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(data) p WHERE p->'path'->>0=$2 AND p->'path'->>1=$3)").bind(t).bind(area).bind(id).fetch_one(&mut **tx).await?
    } else {
        0
    };
    let rules:i64=sqlx::query_scalar("SELECT (SELECT count(*) FROM commerce_rules WHERE tenant=$1 AND jsonb_path_exists(condition,'$.** ? (@ == $id)',jsonb_build_object('id',$2::text))) + (SELECT count(*) FROM commerce_flows WHERE tenant=$1 AND jsonb_path_exists(data,'$.** ? (@ == $id)',jsonb_build_object('id',$2::text)))").bind(t).bind(id).fetch_one(&mut **tx).await?;
    Ok(
        json!({"rules":rules,"orders":orders,"carts":carts,"overrides":overrides,"canDelete":orders+carts+overrides+rules==0}),
    )
}
pub(crate) async fn method_dependencies(
    State(a): State<App>,
    h: RequestContext,
    Path((area, id)): Path<(String, String)>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.read")?;
    let t = merchant(&a, &h)?;
    let mut tx = a.db.begin().await?;
    let v = counts(&mut tx, &t, &area, &id, None).await?;
    tx.commit().await?;
    Ok(Json(v))
}
pub(super) async fn guard(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    old: &Settings,
    next: &Settings,
    channel: Option<&str>,
) -> Result<()> {
    for (area, previous, current) in [
        (
            "shipping",
            old.shipping
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            next.shipping
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
        ),
        (
            "payments",
            old.payments
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            next.payments
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
        ),
    ] {
        for id in previous.into_iter().filter(|id| !current.contains(id)) {
            if counts(tx, t, area, id, channel).await?["canDelete"] != true {
                return Err(conflict("Method is referenced; deactivate it instead"));
            }
        }
    }
    Ok(())
}
