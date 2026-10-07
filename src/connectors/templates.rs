//! Bounded immutable envelopes and non-executable multilingual templates; HTML substitutions are escaped.
use super::*;
use config::{Settings, address};
use serde::{Deserialize, Serialize};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mail {
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub bcc: Vec<String>,
    pub subject: String,
    pub text: String,
    pub html: String,
    pub reply_to: String,
    pub from_email: String,
    pub from_name: String,
}
fn recipients(v: &Value) -> Result<Vec<String>> {
    let list = if let Some(s) = v.as_str() {
        vec![json!(s)]
    } else if v.is_null() {
        vec![]
    } else {
        v.as_array()
            .cloned()
            .ok_or(Error::Invalid("Invalid recipient list"))?
    };
    checked(list.len() <= 10, "Maximum ten recipients per field")?;
    list.into_iter()
        .map(|v| address(v.as_str().ok_or(Error::Invalid("Invalid recipient"))?))
        .collect()
}
pub fn envelope(v: &Value, s: &Settings) -> Result<Mail> {
    let o = v
        .as_object()
        .ok_or(Error::Invalid("Invalid mail envelope"))?;
    checked(
        o.keys().all(|k| {
            ["to", "cc", "bcc", "subject", "text", "html", "replyTo"].contains(&k.as_str())
        }),
        "Unknown mail envelope field",
    )?;
    for k in ["subject", "text", "html", "replyTo"] {
        checked(o.get(k).is_none_or(Value::is_string), "Invalid mail text")?;
    }
    let m = Mail {
        to: recipients(&v["to"])?,
        cc: recipients(&v["cc"])?,
        bcc: recipients(&v["bcc"])?,
        subject: text(v, "subject"),
        text: text(v, "text"),
        html: text(v, "html"),
        reply_to: v["replyTo"].as_str().unwrap_or(&s.reply_to).into(),
        from_email: s.from_email.clone(),
        from_name: s.from_name.clone(),
    };
    checked(!m.to.is_empty(), "Recipient required")?;
    checked(
        !m.subject.trim().is_empty()
            && m.subject.len() <= 200
            && !m.subject.contains(['\r', '\n', '\0']),
        "Invalid mail subject",
    )?;
    checked(
        m.text.len() <= 16000
            && m.html.len() <= 16000
            && (!m.text.is_empty() || !m.html.is_empty())
            && serde_json::to_vec(&m).unwrap().len() <= 40000,
        "Mail body exceeds limit or is empty",
    )?;
    if !m.reply_to.is_empty() {
        address(&m.reply_to)?;
    }
    Ok(m)
}
pub fn defaults() -> Value {
    serde_json::from_str(include_str!("order-templates.json")).unwrap()
}
pub fn escape(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}
fn render(raw: &str, vars: &Value, html: bool) -> Result<String> {
    let re = regex::Regex::new(r"\{([a-zA-Z][a-zA-Z0-9]*)\}").unwrap();
    let mut output = String::new();
    let mut at = 0;
    for c in re.captures_iter(raw) {
        let whole = c.get(0).unwrap();
        output.push_str(&raw[at..whole.start()]);
        let val = vars
            .get(&c[1])
            .ok_or(Error::Invalid("Unknown mail template variable"))?;
        let val = val.as_str().map(str::to_owned).unwrap_or(val.to_string());
        output.push_str(&if html { escape(&val) } else { val });
        at = whole.end();
    }
    output.push_str(&raw[at..]);
    Ok(output)
}
pub fn order(v: &Value, s: &Settings) -> Result<Mail> {
    let event = &v["event"];
    let o = event.get("order").unwrap_or(event);
    let c = &o["orderCustomer"];
    checked(
        c["email"].as_str().is_some_and(|s| !s.is_empty()),
        "Order customer email required",
    )?;
    let locale = v["locale"]
        .as_str()
        .unwrap_or(&s.locale)
        .split('-')
        .next()
        .unwrap_or("en");
    let mut template = defaults()[locale].clone();
    checked(!template.is_null(), "Unsupported email language")?;
    if let Some(t) = s.templates.get(locale) {
        for (k, val) in [
            ("subject", &t.subject),
            ("text", &t.text),
            ("html", &t.html),
        ] {
            if let Some(val) = val {
                template[k] = json!(val);
            }
        }
    }
    let price = &o["cart"]["price"]["totalPrice"];
    let price = price
        .as_f64()
        .map(|x| format!("{x:.2}"))
        .unwrap_or_else(|| price.as_str().unwrap_or("").into());
    let vars = json!({"orderNumber":o.get("orderNumber").unwrap_or(&event["orderId"]),"firstName":c["firstName"].as_str().or(c["name"].as_str()).unwrap_or(""),"totalPrice":if locale=="en" {price}else{price.replace('.',",")},"currency":o["currencyId"].as_str().unwrap_or("EUR")});
    envelope(
        &json!({"to":c["email"],"subject":render(&text(&template,"subject"),&vars,false)?,"text":render(&text(&template,"text"),&vars,false)?,"html":render(&text(&template,"html"),&vars,true)?}),
        s,
    )
}
pub fn consumer(event: &Value, s: &Settings) -> Result<Value> {
    let data = &event["receipt"];
    let locale = data["locale"]
        .as_str()
        .unwrap_or(&s.locale)
        .split('-')
        .next()
        .unwrap_or("en");
    let (subject, body) = match locale {
        "de" => (
            "Anfrage eingegangen",
            "Wir haben deine Erklärung erhalten. Dies bestätigt den Eingang, keine Erstattung oder Erledigung. Bewahre diese Nachricht auf.",
        ),
        "fr" => (
            "Demande reçue",
            "Nous avons reçu votre déclaration. Ceci confirme la réception, pas un remboursement ou une résolution. Conservez ce message.",
        ),
        "es" => (
            "Solicitud recibida",
            "Hemos recibido tu declaración. Esto confirma la recepción, no un reembolso ni una resolución. Conserva este mensaje.",
        ),
        _ => (
            "Request received",
            "We received your declaration. This confirms receipt, not a refund or completion. Keep this message.",
        ),
    };
    let mut receipt = json!({"requestId":event["requestId"],"kind":event["kind"]});
    for key in ["name", "email", "reference", "message", "receivedAt"] {
        receipt[key] = data[key].clone();
    }
    Ok(
        json!({"to":data["email"],"subject":subject,"text":format!("{body}\n\n{}",serde_json::to_string_pretty(&receipt).map_err(|_|Error::Database)?)}),
    )
}
