//! Idempotent synthetic template catalogue initialization.
use crate::*;

pub(crate) async fn seed(a: &App) -> Result<()> {
    let demo = [
        (
            "lamp",
            "Arc Desk Light",
            "lighting",
            "Warm dimmable light, recycled aluminium.",
            79.9,
            19.,
            40,
        ),
        (
            "chair",
            "Form Chair",
            "furniture",
            "Oak frame, natural linen, compact design.",
            189.,
            19.,
            20,
        ),
        (
            "desk",
            "Studio Desk",
            "furniture",
            "Solid oak workspace with concealed cable tray.",
            449.,
            19.,
            10,
        ),
        (
            "mug",
            "Everyday Cup",
            "objects",
            "Hand-finished stoneware, dishwasher safe.",
            24.9,
            19.,
            80,
        ),
        (
            "notebook",
            "Field Notes",
            "objects",
            "Recycled paper and stitched binding.",
            12.5,
            7.,
            150,
        ),
        (
            "shelf",
            "Line Shelf",
            "furniture",
            "Modular oak storage, wall or desk mounting.",
            119.,
            19.,
            25,
        ),
    ];
    for t in ["atelier", "workshop"] {
        for (id, name, category, description, price, tax, stock) in demo {
            sqlx::query("INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING").bind(t).bind(id).bind(name).bind(category).bind(description).bind(price).bind(tax).bind(stock).execute(&a.db).await?;
        }
        let salt = SaltString::encode_b64(Uuid::new_v4().as_bytes()).unwrap();
        let password_hash = Argon2::default()
            .hash_password(b"demo-business", &salt)
            .unwrap()
            .to_string();
        sqlx::query("INSERT INTO customers(tenant,email,password_hash,company,group_name) VALUES($1,'buyer@example.test',$2,'Example Studio','business') ON CONFLICT DO NOTHING").bind(t).bind(password_hash).execute(&a.db).await?;
        sqlx::query("INSERT INTO experiences(tenant,data) VALUES($1,$2) ON CONFLICT DO NOTHING")
            .bind(t)
            .bind(json!({"mode":"balanced","headline":"Objects for a more considered everyday."}))
            .execute(&a.db)
            .await?;
        for v in ["discovery", "comparison"] {
            sqlx::query("INSERT INTO policy(tenant,variant) VALUES($1,$2) ON CONFLICT DO NOTHING")
                .bind(t)
                .bind(v)
                .execute(&a.db)
                .await?;
        }
    }
    Ok(())
}
