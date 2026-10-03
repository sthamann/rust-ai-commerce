//! Calendar comparisons use an explicit server clock, IANA zones and the original exclusive date-range end.
use super::*;
use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, NaiveTime, Timelike, Utc};
pub(super) fn validate(name: &str, c: &Value) -> Result<(), String> {
    if name == "dateRange" {
        if !c["useTime"].is_boolean() {
            return Err("Date range useTime flag required".into());
        }
        for key in ["fromDate", "toDate"] {
            if let Some(s) = c[key].as_str() {
                parse(s)?;
            } else if !c[key].is_null() {
                return Err("Invalid date bound".into());
            }
        }
    } else if name == "timeRange" {
        for key in ["fromTime", "toTime"] {
            NaiveTime::parse_from_str(c[key].as_str().ok_or("Time bound required")?, "%H:%M")
                .map_err(|_| "Invalid time bound")?;
        }
    }
    if name == "dayOfWeek"
        && (!c["dayOfWeek"]
            .as_u64()
            .is_some_and(|n| (1..=7).contains(&n))
            || !matches!(c["operator"].as_str(), Some("=") | Some("!=")))
    {
        return Err("Weekday requires 1..7 and = or !=".into());
    }
    if let Some(zone) = c["timezone"].as_str() {
        zone.parse::<chrono_tz::Tz>()
            .map_err(|_| "Unknown IANA timezone")?;
    }
    Ok(())
}
pub(super) fn evaluate(name: &str, c: &Value, f: &Value) -> Result<bool, String> {
    validate(name, c)?;
    let now =
        DateTime::parse_from_rfc3339(f["currentTime"].as_str().ok_or("Server clock required")?)
            .map_err(|_| "Invalid server clock")?
            .with_timezone(&Utc);
    let zone = c["timezone"]
        .as_str()
        .unwrap_or("UTC")
        .parse::<chrono_tz::Tz>()
        .map_err(|_| "Invalid timezone")?;
    if name == "dayOfWeek" {
        return comparison::compare(
            &json!(now.weekday().number_from_monday()),
            &c["dayOfWeek"],
            c["operator"].as_str().unwrap_or("="),
            "number",
        );
    }
    if name == "timeRange" {
        let from = NaiveTime::parse_from_str(c["fromTime"].as_str().unwrap(), "%H:%M").unwrap();
        let to = NaiveTime::parse_from_str(c["toTime"].as_str().unwrap(), "%H:%M").unwrap();
        let time = now.with_timezone(&zone).time().with_nanosecond(0).unwrap();
        return Ok(if to < from {
            time < to || time > from
        } else {
            time >= from && time <= to
        });
    }
    let use_time = c["useTime"].as_bool().unwrap_or(false);
    let current = now.naive_utc();
    if let Some(s) = c["fromDate"].as_str() {
        let v = parse(s)?;
        let from = if use_time {
            v
        } else {
            v.date().and_hms_opt(0, 0, 0).unwrap()
        };
        if current < from {
            return Ok(false);
        }
    }
    if let Some(s) = c["toDate"].as_str() {
        let v = parse(s)?;
        let to = if use_time {
            v
        } else {
            v.date()
                .succ_opt()
                .ok_or("Date overflow")?
                .and_hms_opt(0, 0, 0)
                .unwrap()
        };
        if current >= to {
            return Ok(false);
        }
    }
    Ok(true)
}
pub(super) fn date(
    actual: &Value,
    rule: &Value,
    op: &str,
    date_only: bool,
) -> Result<bool, String> {
    if actual.is_null() {
        return Ok(matches!(op, "empty" | "!="));
    }
    if op == "empty" {
        return Ok(false);
    }
    let a = parse(actual.as_str().ok_or("Date fact required")?)?;
    let key = |v: NaiveDateTime| {
        if date_only {
            v.date().and_hms_opt(0, 0, 0).unwrap()
        } else {
            v
        }
    };
    if op == "between" {
        let (from, to) = (
            parse(rule["from"].as_str().ok_or("Date lower bound required")?)?,
            parse(rule["to"].as_str().ok_or("Date upper bound required")?)?,
        );
        return Ok(key(a) >= key(from) && key(a) <= key(to));
    }
    let b = parse(rule.as_str().ok_or("Date expected value required")?)?;
    Ok(match op {
        "=" => key(a) == key(b),
        "!=" => key(a) != key(b),
        ">" => a > b,
        ">=" => a >= b,
        "<" => a < b,
        "<=" => a <= b,
        _ => return Err("Unknown date operator".into()),
    })
}
fn parse(s: &str) -> Result<NaiveDateTime, String> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.naive_local())
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S"))
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M"))
        .or_else(|_| {
            NaiveDate::parse_from_str(s, "%Y-%m-%d").map(|d| d.and_hms_opt(0, 0, 0).unwrap())
        })
        .map_err(|_| "Invalid ISO calendar date".into())
}
