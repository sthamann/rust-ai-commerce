//! Flow graph and source action schema regression tests reject unsafe graphs before any event dispatch.
use super::*;
fn pipeline(v: Value) -> pipeline::Pipeline {
    serde_json::from_value(v).unwrap()
}
#[test]
fn graph_rejects_cycles_missing_edges_unreachable_nodes_and_unbounded_delay() {
    for nodes in [
        json!([{ "kind":"delay","id":"a","seconds":1,"next":"a"}]),
        json!([{ "kind":"delay","id":"a","seconds":1,"next":"absent"}]),
        json!([{ "kind":"stop","id":"a"},{ "kind":"stop","id":"b"}]),
        json!([{ "kind":"delay","id":"a","seconds":2592001,"next":null}]),
    ] {
        assert!(
            pipeline(json!({"entry":"a","nodes":nodes}))
                .validate()
                .is_err()
        );
    }
    assert!(pipeline(json!({"entry":"a","nodes":[{"kind":"condition","id":"a","condition":{"type":"alwaysValid"},"on_true":"b","on_false":"c"},{"kind":"stop","id":"b"},{"kind":"delay","id":"c","seconds":2592000,"next":null}]})).validate().is_ok());
}
#[test]
fn upstream_aliases_and_download_revoke_are_explicit() {
    assert!(flow_actions::validate("action.add.customer.tag", &json!({"tagIds":["vip"]})).is_ok());
    assert!(
        flow_actions::validate(
            "action.change.customer.group",
            &json!({"customerGroupId":"business"})
        )
        .is_ok()
    );
    assert!(
        flow_actions::validate("action.grant.download.access", &json!({"value":false})).is_ok()
    );
    assert!(
        flow_actions::validate("action.grant.download.access", &json!({"value":"false"})).is_err()
    );
    assert!(flow_actions::validate("action.mail.send", &json!({"templateId":"missing"})).is_err());
    assert!(flow_actions::validate("shell", &json!({})).is_err());
    assert!(metadata::validate_metadata("products", &json!({"price":0})).is_err());
    assert!(metadata::validate_metadata("products", &json!({"width":-1})).is_err());
}
