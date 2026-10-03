//! Regression cases cover missing authority under NOT, original quantifiers, dates, metadata types and registry bounds.
use super::*;
fn facts() -> Value {
    json!({"currentTime":"2026-10-03T12:00:00Z","customer":{"loggedIn":false,"group":"consumer","customFields":{}},"lines":[{"referencedId":"mug","parentId":null,"good":true,"type":"product","quantity":2,"totalPrice":10,"categoryIds":["home"],"customFields":{"flag":true,"amount":2},"purchasePrices":{"gross":4,"net":3}}]})
}
fn child(name: &str, config: Value) -> Value {
    json!({"type":name,"config":config})
}
#[test]
fn not_cannot_turn_missing_authority_into_a_discount() {
    let c = json!({"children":[child("cartCartAmount",json!({"operator":">","amount":100}))]});
    assert!(evaluate("notContainer", &c, &facts()).is_err());
    assert!(validate("scriptRule", &json!({}), 0).is_err());
    assert!(validate("unknown_condition", &json!({}), 0).is_err());
}
#[test]
fn xor_preserves_zero_one_and_multiple_matches() {
    for hits in 0..=3 {
        let c = json!({"children":(0..hits).map(|_|child("alwaysValid",json!({}))).collect::<Vec<_>>()});
        assert_eq!(evaluate("xorContainer", &c, &facts()).unwrap(), hits == 1);
    }
    assert!(validate("notContainer", &json!({"children":[]}), 0).is_err());
    assert!(
        validate(
            "andContainer",
            &json!({"children":vec![child("alwaysValid",json!({}));21]}),
            0
        )
        .is_err()
    );
}
#[test]
fn guests_keep_context_group_but_do_not_become_customers() {
    assert!(
        evaluate(
            "customerCustomerGroup",
            &json!({"operator":"=","customerGroupIds":["consumer"]}),
            &facts()
        )
        .unwrap()
    );
    assert!(!evaluate("customerIsActive", &json!({"isActive":false}), &facts()).unwrap());
    assert!(!evaluate("customerCustomField",&json!({"renderedField":{"name":"flag","type":"bool"},"renderedFieldValue":false,"operator":"="}),&facts()).unwrap());
}
#[test]
fn goods_count_price_and_quantity_filters_use_the_selected_line() {
    for (name, field, expected) in [
        ("cartGoodsCount", "count", 1),
        ("cartGoodsPrice", "amount", 10),
        ("cartLineItemGoodsTotal", "count", 2),
    ] {
        for category in ["home", "absent"] {
            let c = json!({"operator":"=",field:expected,"filter":child("andContainer",json!({"children":[child("cartLineItemInCategory",json!({"operator":"=","categoryIds":[category]}))]}))});
            assert_eq!(evaluate(name, &c, &facts()).unwrap(), category == "home");
        }
    }
    let c = json!({"children":[child("cartLineItemPerItemQuantity",json!({"operator":"=","quantity":2}))],"types":["product"]});
    assert!(evaluate("allLineItemsContainer", &c, &facts()).unwrap());
    let mut empty = facts();
    empty["lines"] = json!([]);
    assert!(!evaluate("allLineItemsContainer", &c, &empty).unwrap());
}
#[test]
fn calendar_boundaries_and_weekday_validation_are_explicit() {
    let c = json!({"useTime":true,"fromDate":"2026-10-03T00:00:00","toDate":"2026-10-03T12:00:00","timezone":"Europe/Berlin"});
    assert!(!evaluate("dateRange", &c, &facts()).unwrap());
    assert!(
        evaluate(
            "dateRange",
            &json!({"useTime":false,"fromDate":"2026-10-03","toDate":"2026-10-03"}),
            &facts()
        )
        .unwrap()
    );
    assert!(validate("dayOfWeek", &json!({"dayOfWeek":8,"operator":"="}), 0).is_err());
    assert!(
        validate(
            "timeRange",
            &json!({"fromTime":"22:00","toTime":"04:00","timezone":"invented"}),
            0
        )
        .is_err()
    );
    assert!(
        !evaluate(
            "timeRange",
            &json!({"fromTime":"22:00","toTime":"04:00"}),
            &facts()
        )
        .unwrap()
    );
}
#[test]
fn custom_fields_are_typed_and_purchase_prices_are_quantity_weighted() {
    let c = json!({"renderedField":{"name":"flag","type":"bool"},"renderedFieldValue":true,"operator":"="});
    assert!(evaluate("cartLineItemCustomField", &c, &facts()).unwrap());
    let c = json!({"renderedField":{"name":"amount","type":"int"},"renderedFieldValue":"2","operator":"="});
    assert!(!evaluate("cartLineItemCustomField", &c, &facts()).unwrap());
    assert!(
        evaluate(
            "cartTotalPurchasePrice",
            &json!({"type":"net","amount":6,"operator":"="}),
            &facts()
        )
        .unwrap()
    );
    assert!(
        evaluate(
            "cartLineItemPurchasePrice",
            &json!({"type":"gross","amount":4,"operator":"="}),
            &facts()
        )
        .unwrap()
    );
    assert!(
        validate(
            "cartLineItemPurchasePrice",
            &json!({"type":"wrong","amount":4,"operator":"="}),
            0
        )
        .is_err()
    );
}
