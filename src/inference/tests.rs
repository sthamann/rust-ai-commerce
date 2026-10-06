//! Provider response contracts, strict schemas and truncation rejection.

use super::*;
#[test]
fn provider_protocols_and_incomplete_output() {
    assert!(
        parse(
            &Provider::Ollama,
            &json!({"done_reason":"length","message":{"content":"{}"}})
        )
        .is_err()
    );
    assert_eq!(parse(&Provider::Openai,&json!({"status":"completed","output":[{"type":"reasoning"},{"content":[{"type":"output_text","text":"{\"answer\":1}"}]}]})).unwrap(),json!({"answer":1}));
    assert_eq!(parse(&Provider::Anthropic,&json!({"content":[{"type":"thinking","thinking":"private"},{"type":"text","text":"{\"answer\":2}"}]})).unwrap(),json!({"answer":2}));
    assert!(
        parse(
            &Provider::Openai,
            &json!({"status":"incomplete","output":[]})
        )
        .is_err()
    );
    assert!(
        parse(
            &Provider::Anthropic,
            &json!({"stop_reason":"max_tokens","content":[]})
        )
        .is_err()
    );
}
#[test]
fn app_presentation_schema_supports_strict_provider_generation() {
    let bundled: Value =
        serde_json::from_str(include_str!("../../fixtures/app-studio-schema.json")).unwrap();
    let schema = strict_schema(bundled);
    let p = &schema["properties"]["manifest"]["properties"]["presentation"]["anyOf"][0];
    assert_eq!(p["required"], json!(["cover", "description", "icon"]));
    assert_eq!(p["properties"]["description"]["type"], "object");
    assert!(p["properties"]["description"].get("anyOf").is_none());
    assert_eq!(
        p["properties"]["description"]["additionalProperties"],
        false
    );
}
#[test]
fn optional_nested_schema_is_nullable_and_required() {
    let schema = strict_schema(
        json!({"type":"object","properties":{"change":{"type":"object","properties":{"price":{"type":"number"}},"required":[]}},"required":[]}),
    );
    assert_eq!(schema["required"], json!(["change"]));
    assert_eq!(
        schema["properties"]["change"]["anyOf"][0]["required"],
        json!(["price"])
    );
}

#[test]
fn platform_readiness_follows_selected_provider_and_disabled_state() {
    let mut service = Inference::from_env(reqwest::Client::new());
    service.default_provider = Provider::Openai;
    service.openai_key = None;
    assert_eq!(service.providers()["providers"][0]["configured"], false);
    service.openai_key = Some("synthetic".into());
    assert_eq!(service.providers()["providers"][0]["configured"], true);
    service.disabled.push("openai".into());
    assert_eq!(service.providers()["providers"][0]["configured"], false);
}
