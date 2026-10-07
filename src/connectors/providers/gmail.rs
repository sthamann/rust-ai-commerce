//! Read-only Gmail incremental imports preserve high-water cursors, bounded windows and deletion evidence.
use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use std::collections::BTreeSet;
fn plain(v: &Value, depth: usize) -> String {
    if depth > 20 {
        return String::new();
    }
    if ["text/plain", "text/html"].contains(&v["mimeType"].as_str().unwrap_or(""))
        && v["body"]["data"].is_string()
    {
        let raw = URL_SAFE_NO_PAD
            .decode(text(&v["body"], "data").trim_end_matches('='))
            .unwrap_or_default();
        let text = String::from_utf8_lossy(&raw)
            .chars()
            .take(4000)
            .collect::<String>();
        if v["mimeType"] == "text/html" {
            let doc = scraper::Html::parse_fragment(&text);
            let mut out = String::new();
            for node in doc.tree.nodes() {
                if let scraper::Node::Text(t) = node.value()
                    && !node.ancestors().any(|p|matches!(p.value(),scraper::Node::Element(e) if ["script","style"].contains(&e.name()))) {out.push_str(t);}
            }
            return out.chars().take(4000).collect();
        }
        return text;
    }
    v["parts"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|p| plain(p, depth + 1))
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
        .chars()
        .take(4000)
        .collect()
}
async fn get(base: &str, path: &str, params: &[(&str, &str)], token: &str) -> Result<Value> {
    let mut url = reqwest::Url::parse(&format!("{base}/{path}")).map_err(|_| Error::Database)?;
    url.query_pairs_mut().extend_pairs(params.iter().copied());
    network::request(url.as_str(), None, Some(token), false).await
}
pub async fn gmail(store: &Store, t: &str, settings: &Value) -> Result<Value> {
    let current = store.get(t, "gmail").await?;
    let token = oauth::token(store, t, "gmail").await?;
    let base = format!("{}/users/me", network::endpoint("gmail")?);
    let label = settings["labelId"].as_str().unwrap_or("INBOX");
    let mut ids = BTreeSet::new();
    let mut deleted = BTreeSet::new();
    let mut history = text(&current, "historyId");
    let mut full = false;
    if !history.is_empty() {
        let mut page = String::new();
        for _ in 0..10 {
            let result = get(
                &base,
                "history",
                &[
                    ("startHistoryId", &history),
                    ("labelId", label),
                    ("maxResults", "100"),
                    ("pageToken", &page),
                ],
                &token,
            )
            .await;
            let value = match result {
                Err(Error::Http(404, _)) => {
                    history.clear();
                    break;
                }
                v => v?,
            };
            for row in value["history"].as_array().into_iter().flatten() {
                for key in [
                    "messagesAdded",
                    "labelsAdded",
                    "labelsRemoved",
                    "messagesDeleted",
                ] {
                    for m in row[key].as_array().into_iter().flatten() {
                        let id = text(&m["message"], "id");
                        if key == "messagesDeleted" {
                            deleted.insert(id);
                        } else {
                            ids.insert(id);
                        }
                    }
                }
            }
            page = text(&value, "nextPageToken");
            if page.is_empty() {
                history = text(&value, "historyId");
                break;
            }
        }
        checked(
            page.is_empty() || history.is_empty(),
            "Mailbox change window too large; reset sync cursor",
        )?;
    }
    if history.is_empty() {
        full = true;
        history = text(&get(&base, "profile", &[], &token).await?, "historyId");
        let mut page = String::new();
        for _ in 0..10 {
            let value = get(
                &base,
                "messages",
                &[
                    ("labelIds", label),
                    ("maxResults", "50"),
                    ("pageToken", &page),
                ],
                &token,
            )
            .await?;
            for m in value["messages"].as_array().into_iter().flatten() {
                ids.insert(text(m, "id"));
            }
            page = text(&value, "nextPageToken");
            if page.is_empty() {
                break;
            }
        }
        checked(
            page.is_empty(),
            "Label has more than 500 messages; choose a dedicated support label",
        )?;
    }
    checked(
        ids.len() <= 500 && deleted.len() <= 500 && !history.is_empty(),
        "Mailbox window exceeds bounded sync",
    )?;
    let mut sources = vec![];
    let re = regex::Regex::new(r"RAC-[A-Za-z0-9]+").unwrap();
    for id in ids.difference(&deleted).cloned().collect::<Vec<_>>() {
        let path = format!("messages/{}", percent(&id));
        let value = match get(&base, &path, &[("format", "full")], &token).await {
            Err(Error::Http(404, _)) => {
                deleted.insert(id);
                continue;
            }
            v => v?,
        };
        if !value["labelIds"]
            .as_array()
            .is_some_and(|a| a.contains(&json!(label)))
        {
            deleted.insert(id);
            continue;
        }
        let mut headers = json!({});
        for h in value["payload"]["headers"].as_array().into_iter().flatten() {
            headers[text(h, "name").to_lowercase()] = h["value"].clone();
        }
        let subject = headers["subject"]
            .as_str()
            .unwrap_or("Support message")
            .chars()
            .take(300)
            .collect::<String>();
        let body = plain(&value["payload"], 0);
        let body = if body.is_empty() {
            text(&value, "snippet")
        } else {
            body
        };
        let text = format!("{subject}\n{body}")
            .chars()
            .take(4000)
            .collect::<String>();
        let order = re.find(&text).map(|m| m.as_str());
        sources.push(json!({"id":format!("message-{id}"),"kind":"support_email","title":subject,"text":text,"sourceUrl":format!("https://mail.google.com/mail/u/0/#all/{}",value["threadId"].as_str().unwrap_or(&id)),"metadata":{"messageId":id,"threadId":value["threadId"],"from":headers["from"].as_str().unwrap_or(""),"date":headers["date"].as_str().unwrap_or(""),"orderNumber":order}}));
    }
    if full {
        for r in store.sources(t, "gmail").await? {
            if r["deleted"] != true
                && let Some(id) = r["id"].as_str().and_then(|s| s.strip_prefix("message-"))
                && !ids.contains(id)
            {
                deleted.insert(id.into());
            }
        }
    }
    sources.extend(
        deleted
            .into_iter()
            .map(|id| json!({"id":format!("message-{id}"),"deleted":true})),
    );
    store
        .put_sources(
            t,
            "gmail",
            &sources,
            settings,
            &current["revision"],
            Some(&history),
        )
        .await?;
    Ok(json!({"messagesImported":sources.len(),"historyId":history}))
}
fn percent(raw: &str) -> String {
    raw.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"_-".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
