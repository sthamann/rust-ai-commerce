//! Regression cases for native rule facts and original container boundaries.
use super::*;
fn numeric(a: f64, b: f64, op: &str) -> bool {
    rust_ai_commerce::rule_comparison::numeric(Some(a), Some(b), op).unwrap_or(false)
}
#[test]
fn rejects_unknown_and_unbounded_conditions() {
    assert!(serde_json::from_value::<Condition>(json!({"type":"runShell"})).is_err());
    assert!(
        Condition::Amount {
            operator: "exec".into(),
            amount: 1.
        }
        .validate(0)
        .is_err()
    );
    assert!(
        Condition::And {
            children: vec![Condition::Always; 21]
        }
        .validate(0)
        .is_err()
    );
}
#[test]
fn guest_email_never_grants_authentication_and_boolean_groups_are_exact() {
    let mut c=StoredCart{id:"test".into(),tenant:"test".into(),token:"".into(),revision:1,status:"open".into(),data:serde_json::from_value(json!({"items":[],"group":"consumer","email":"guest@example.test","company":null,"session":"test","buyer":null,"order":null})).unwrap()};
    let logged = Condition::LoggedIn { is_logged_in: true };
    assert!(!logged.matches(&c, &json!({})));
    assert!(
        Condition::Not {
            child: Box::new(logged.clone())
        }
        .matches(&c, &json!({}))
    );
    assert!(Condition::And { children: vec![] }.matches(&c, &json!({})));
    assert!(!Condition::Or { children: vec![] }.matches(&c, &json!({})));
    c.data.customer_id = Some("customer".into());
    assert!(logged.matches(&c, &json!({})));
    let group = Condition::Group {
        values: vec!["business".into()],
        operator: "!=".into(),
    };
    assert!(group.matches(&c, &json!({})));
    let field = Condition::EventField {
        path: "metadata.orderNumber".into(),
        operator: "=".into(),
        value: json!("RAC-123"),
    };
    field.validate(0).unwrap();
    assert!(field.matches(&c, &json!({"event":{"metadata":{"orderNumber":"RAC-123"}}})));
}
#[test]
fn operators_match_boundaries() {
    assert!(numeric(100., 100., "="));
    assert!(!numeric(99., 100., ">="));
    assert!(numeric(100., 100., ">="));
    assert!(!numeric(100., 100., "<"));
}

#[test]
fn original_country_and_variant_conditions_keep_shopware_scope_semantics() {
    let c=StoredCart{id:"test".into(),tenant:"test".into(),token:"".into(),revision:1,status:"open".into(),data:serde_json::from_value(json!({"items":[{"id":"mug","quantity":1}],"group":"consumer","email":null,"company":null,"session":"test","buyer":null,"order":null})).unwrap()};
    let country = commerce::selection(&c.data).country;
    assert!(
        Condition::CustomerShippingCountry {
            values: vec![country],
            operator: "=".into()
        }
        .matches(&c, &json!({}))
    );
    let empty: Condition =
        serde_json::from_value(json!({"type":"customerBillingCountry","operator":"empty"}))
            .unwrap();
    assert!(empty.matches(&c, &json!({})));
    let q = json!({"lineItems":[{"referencedId":"mug-blue","parentId":"mug"},{"referencedId":"chair","parentId":null}]});
    assert!(
        Condition::OriginalProduct {
            values: vec!["mug".into()],
            operator: "=".into()
        }
        .matches(&c, &q)
    );
    // Shopware compares each goods line (including the parent); a nonmatching line satisfies !=.
    assert!(
        Condition::OriginalProduct {
            values: vec!["mug".into()],
            operator: "!=".into()
        }
        .matches(&c, &q)
    );
    assert!(
        !Condition::Product {
            values: vec!["mug".into()],
            operator: "!=".into()
        }
        .matches(&c, &q)
    );
    assert!(
        !Condition::OriginalProduct {
            values: vec!["mug".into()],
            operator: "!=".into()
        }
        .matches(&c, &json!({"lineItems":[]}))
    );
}
