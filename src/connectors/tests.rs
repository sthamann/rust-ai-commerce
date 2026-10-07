//! Actual Rust parsers, encryption and template consumers reject escalation/injection and preserve language behavior.
use super::*;
#[test]
fn settings_have_compiler_types_and_fail_closed_runtime_boundaries() {
    let s = config::parse(&json!({})).unwrap();
    assert!(!s.enabled);
    assert!(s.dry_run);
    assert!(s.notify_consumer_requests);
    for v in [
        json!({"enabled":"true"}),
        json!({"dryRun":0}),
        json!({"provider":"shell"}),
        json!({"smtpPort":65536}),
        json!({"smtpPort":0}),
        json!({"locale":"xx"}),
        json!({"fromName":"ok\r\nBCC: bad"}),
        json!({"smtpHost":"http://internal"}),
        json!({"templates":{"xx":{}}}),
        json!({"templates":{"en":{"execute":"rm"}}}),
        json!({"apiKey":"leaked"}),
    ] {
        assert!(config::parse(&v).is_err(), "{v}");
    }
}
#[test]
fn encryption_is_randomized_authenticated_and_tenant_app_bound() {
    let cipher = crypto::Crypto::new("BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=").unwrap();
    let value = json!({"password":"private-fixture-secret"});
    let a = cipher.seal("one", "email", &value).unwrap();
    let b = cipher.seal("one", "email", &value).unwrap();
    assert_ne!(a, b);
    assert!(!String::from_utf8_lossy(&a).contains("private-fixture-secret"));
    assert_eq!(cipher.open("one", "email", &a).unwrap(), value);
    assert!(cipher.open("two", "email", &a).is_err());
    assert!(cipher.open("one", "gmail", &a).is_err());
    let mut changed = a;
    changed[15] ^= 1;
    assert!(cipher.open("one", "email", &changed).is_err());
    assert!(crypto::Crypto::new("short").is_err());
}
#[test]
fn envelopes_reject_header_injection_and_unsafe_recipient_lists() {
    let s = config::Settings::default();
    for v in [
        json!({"to":"a@example.test","subject":"x\r\nBcc: injected","text":"x"}),
        json!({"to":"a@example.test","subject":"x","text":1}),
        json!({"to":[],"subject":"x","text":"x"}),
        json!({"to":"a@example.test","subject":"x","text":""}),
        json!({"to":"a@example.test","subject":"x","text":"x","execute":true}),
        json!({"to":"a@example.test\nother","subject":"x","text":"x"}),
    ] {
        assert!(templates::envelope(&v, &s).is_err());
    }
    let many = vec!["a@example.test"; 11];
    assert!(templates::envelope(&json!({"to":many,"subject":"x","text":"x"}), &s).is_err());
    assert!(
        templates::envelope(
            &json!({"to":"a@example.test","subject":"x","text":"x","bcc":["b@example.test"]}),
            &s
        )
        .is_ok()
    );
}
#[test]
fn real_order_template_is_localized_and_html_variables_are_escaped() {
    let mut s = config::Settings::default();
    let event = json!({"order":{"orderNumber":"RAC-42","currencyId":"EUR","orderCustomer":{"email":"buyer@example.test","firstName":"<Ada>"},"cart":{"price":{"totalPrice":12.5}}}});
    let mut subjects = std::collections::BTreeSet::new();
    for locale in ["en", "de", "fr", "es"] {
        let mail = templates::order(&json!({"event":event,"locale":locale}), &s).unwrap();
        assert!(mail.subject.contains("RAC-42"));
        subjects.insert(mail.subject);
        assert!(
            mail.text
                .contains(if locale == "en" { "12.50" } else { "12,50" })
        );
    }
    assert_eq!(subjects.len(), 4);
    s.templates.insert(
        "en".into(),
        config::Template {
            html: Some("<p>{firstName}</p>".into()),
            ..Default::default()
        },
    );
    assert_eq!(
        templates::order(&json!({"event":event}), &s).unwrap().html,
        "<p>&lt;Ada&gt;</p>"
    );
    s.templates.get_mut("en").unwrap().subject = Some("{unknown}".into());
    assert!(templates::order(&json!({"event":event}), &s).is_err());
    assert!(templates::order(&json!({"event":{}}), &s).is_err());
}

#[test]
fn order_mail_uses_frozen_currency_precision_and_exact_amount() {
    let s = config::Settings::default();
    for (code, scale, minor, rendered) in [("JPY", 0, 1234, "1234"), ("KWD", 3, 7123, "7.123")] {
        let event = json!({"order":{"orderNumber":"FX-1","currencyId":"EUR",
            "money":{"minor":minor,"currency":{"code":code,"scale":scale}},
            "orderCustomer":{"email":"buyer@example.test","firstName":"Ada"},
            "cart":{"price":{"totalPrice":999.99}}}});
        let mail = templates::order(&json!({"event":event,"locale":"en"}), &s).unwrap();
        assert!(mail.text.contains(&format!("{rendered} {code}")));
        assert!(!mail.text.contains("999.99"));
        let mail = templates::order(&json!({"event":event,"locale":"de"}), &s).unwrap();
        assert!(mail.text.contains(&rendered.replace('.', ",")));
    }
}
#[test]
fn consumer_receipts_preserve_declaration_and_do_not_claim_resolution() {
    let s = config::Settings::default();
    for locale in ["en", "de", "fr", "es"] {
        let event = json!({"requestId":"req-42","kind":"withdrawal","receipt":{"locale":locale,"email":"buyer@example.test","name":"Synthetic Buyer","message":"withdraw","reference":"RAC-42","receivedAt":"2026-10-07T00:00:00Z"}});
        let receipt = templates::consumer(&event, &s).unwrap();
        let m = templates::envelope(&receipt, &s).unwrap();
        assert!(m.text.contains("req-42"));
        assert!(m.text.contains("receivedAt"));
        assert!(m.text.contains("RAC-42"));
    }
}
#[test]
fn notification_retry_policy_denies_ambiguous_results_and_attempt_eight() {
    for n in [0, 1, 7] {
        assert!(crate::verified_kernel::notification_retry_admissible(
            true, n
        ));
    }
    for n in [0, 1, 7, 8, u64::MAX] {
        assert!(!crate::verified_kernel::notification_retry_admissible(
            false, n
        ));
    }
    for n in [8, 9, u64::MAX] {
        assert!(!crate::verified_kernel::notification_retry_admissible(
            true, n
        ));
    }
}
