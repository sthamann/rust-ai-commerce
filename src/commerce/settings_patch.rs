//! Transport-only sparse JSON differences: stable record IDs, explicit nulls, and deletion distinct from inheritance.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Change {
    path: Vec<String>,
    value: Value,
    remove: bool,
}
fn keyed(mut v: Value) -> Value {
    for key in ["shipping", "payments", "taxes"] {
        if let Some(array) = v[key].as_array() {
            v[key] = Value::Object(
                array
                    .iter()
                    .map(|v| (v["id"].as_str().unwrap_or("").into(), v.clone()))
                    .collect(),
            );
        }
    }
    v
}
fn walk(base: &Value, next: &Value, path: &mut Vec<String>, changes: &mut Vec<Change>) {
    if base == next {
        return;
    }
    if let (Some(b), Some(n)) = (base.as_object(), next.as_object()) {
        for (k, v) in n {
            path.push(k.clone());
            if let Some(old) = b.get(k) {
                walk(old, v, path, changes);
            } else {
                changes.push(Change {
                    path: path.clone(),
                    value: v.clone(),
                    remove: false,
                });
            }
            path.pop();
        }
        for k in b.keys().filter(|k| !n.contains_key(*k)) {
            path.push(k.clone());
            changes.push(Change {
                path: path.clone(),
                value: Value::Null,
                remove: true,
            });
            path.pop();
        }
    } else {
        changes.push(Change {
            path: path.clone(),
            value: next.clone(),
            remove: false,
        });
    }
}
pub(super) fn difference(base: &Settings, next: &Settings) -> Value {
    let mut changes = vec![];
    walk(
        &keyed(json!(base)),
        &keyed(json!(next)),
        &mut vec![],
        &mut changes,
    );
    json!(changes)
}
pub(super) fn resolve(base: &Settings, patch: Value) -> Result<Settings> {
    let changes: Vec<Change> =
        serde_json::from_value(patch).map_err(|_| bad("Invalid settings override"))?;
    if changes.len() > 5000 {
        return Err(bad("Too many settings overrides"));
    }
    let mut v = keyed(json!(base));
    for change in changes {
        if change.path.is_empty() || change.path.len() > 10 {
            return Err(bad("Invalid override path"));
        }
        let mut target = &mut v;
        for part in &change.path[..change.path.len() - 1] {
            let map = target
                .as_object_mut()
                .ok_or(bad("Override parent no longer exists"))?;
            target = map.entry(part).or_insert(json!({}));
        }
        let map = target
            .as_object_mut()
            .ok_or(bad("Invalid override target"))?;
        let key = change.path.last().unwrap();
        if change.remove {
            map.remove(key);
        } else {
            map.insert(key.clone(), change.value);
        }
    }
    for key in ["shipping", "payments", "taxes"] {
        let map = v[key]
            .as_object()
            .ok_or(bad("Invalid override collection"))?;
        // Retain basis order, append channel-local records in deterministic ID order.
        let basis = json!(base);
        let ids = basis[key]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|v| v["id"].as_str())
            .collect::<Vec<_>>();
        let mut records = ids
            .iter()
            .filter_map(|id| map.get(*id).cloned())
            .collect::<Vec<_>>();
        records.extend(
            map.iter()
                .filter(|(id, _)| !ids.contains(&id.as_str()))
                .map(|(_, v)| v.clone()),
        );
        v[key] = json!(records);
    }
    let settings = decode_config(v)?;
    validate_config(&settings)?;
    if settings.main_locale != base.main_locale
        || settings.locales != base.locales
        || json!(settings.country_definitions) != json!(base.country_definitions)
        || settings
            .taxes
            .iter()
            .map(|t| &t.id)
            .collect::<std::collections::BTreeSet<_>>()
            != base.taxes.iter().map(|t| &t.id).collect()
    {
        return Err(bad(
            "Manage language, country and tax-class definitions in the shared basis",
        ));
    }
    Ok(settings)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sparse_updates_follow_ids_inherit_future_values_and_keep_explicit_null() {
        let mut basis: Settings =
            serde_json::from_str(include_str!("../../fixtures/demo-settings.json")).unwrap();
        let mut next = basis.clone();
        next.shipping[0].price = 12.;
        next.shipping[0].free_above = None;
        next.shipping[0].translations.insert(
            "de-DE".into(),
            super::super::method_text::Text {
                name: Some("Abholung lokal".into()),
                description: Some("".into()),
            },
        );
        let patch = difference(&basis, &next);
        basis.shipping.reverse();
        let index = basis.shipping.len() - 1;
        basis.shipping[index].max_days = 8;
        let merged = resolve(&basis, patch).unwrap();
        assert_eq!(merged.shipping[index].price, 12.);
        assert_eq!(merged.shipping[index].max_days, 8);
        assert_eq!(merged.shipping[index].free_above, None);
        assert_eq!(
            resolve(&basis, json!([])).unwrap().shipping[index].price,
            basis.shipping[index].price
        );
    }
}
