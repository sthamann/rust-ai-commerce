//! All-checkout allocation ledger; release is idempotent and always uses persisted quantities, never edited order JSON.
use crate::*;
pub(crate) async fn allocate(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
    order: &str,
) -> Result<()> {
    for item in &c.data.items {
        sqlx::query("INSERT INTO order_inventory_reservations(tenant,order_id,product_id,quantity) VALUES($1,$2,$3,$4)")
            .bind(&c.tenant).bind(order).bind(&item.id).bind(item.quantity as i32).execute(&mut **tx).await?;
    }
    Ok(())
}
pub(crate) async fn release(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    tenant: &str,
    order: &str,
) -> Result<()> {
    let rows = sqlx::query("UPDATE order_inventory_reservations SET released_at=now() WHERE tenant=$1 AND order_id=$2 AND released_at IS NULL RETURNING product_id,quantity")
        .bind(tenant).bind(order).fetch_all(&mut **tx).await?;
    for row in rows {
        sqlx::query(
            "UPDATE products SET stock=stock+$1,revision=revision+1 WHERE tenant=$2 AND id=$3",
        )
        .bind(row.get::<i32, _>("quantity"))
        .bind(tenant)
        .bind(row.get::<String, _>("product_id"))
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}
