//! Finnhub economic-calendar provider (free tier, `FINNHUB_API_KEY` env).
//!
//! Endpoint: `GET /calendar/economic?token=KEY&from=YYYY-MM-DD&to=YYYY-MM-DD`
//! Response: `{ "economicCalendar": [ { country, event, impact, actual,
//! estimate, prev, time: "YYYY-MM-DD HH:MM:SS", unit } ] }`
//!
//! Finnhub's `time` is US/Eastern; we parse it as America/New_York and convert
//! to unix seconds so the frontend formats it consistently.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::{NaiveDate, NaiveDateTime, TimeZone};
use chrono_tz::America::New_York;

use crate::news::{EconEvent, EconProvider};

const ECON_URL: &str = "https://finnhub.io/api/v1/calendar/economic";

/// Finnhub-backed provider. Use when `FINNHUB_API_KEY` is set.
pub struct FinnhubProvider {
    api_key: String,
}

impl FinnhubProvider {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }
}

#[async_trait]
impl EconProvider for FinnhubProvider {
    fn label(&self) -> &'static str {
        "Finnhub"
    }

    async fn fetch(&self, from: NaiveDate, to: NaiveDate) -> Result<Vec<EconEvent>> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?;
        let resp = client
            .get(ECON_URL)
            .query(&[
                ("token", self.api_key.as_str()),
                ("from", &from.format("%Y-%m-%d").to_string()),
                ("to", &to.format("%Y-%m-%d").to_string()),
            ])
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("finnhub econ status {}", resp.status()));
        }
        let json: serde_json::Value = resp.json().await?;
        let arr = json
            .get("economicCalendar")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("finnhub econ: no economicCalendar"))?;

        let mut events = Vec::with_capacity(arr.len());
        for e in arr {
            let time = e
                .get("time")
                .and_then(|v| v.as_str())
                .and_then(parse_finnhub_time)
                .unwrap_or(0);
            events.push(EconEvent {
                country: e.get("country").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                event: e.get("event").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                time,
                impact: e.get("impact").and_then(|v| v.as_str()).unwrap_or("").to_lowercase(),
                actual: e.get("actual").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                forecast: e.get("estimate").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                previous: e.get("prev").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                unit: e.get("unit").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            });
        }
        // Earliest first.
        events.sort_by_key(|ev| ev.time);
        Ok(events)
    }
}

/// Parse Finnhub's "YYYY-MM-DD HH:MM:SS" (US/Eastern) into unix seconds.
fn parse_finnhub_time(s: &str) -> Option<i64> {
    let ndt = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok()?;
    Some(New_York.from_local_datetime(&ndt).earliest()?.timestamp())
}

/// No-key fallback: returns empty so the UI can show a "set FINNHUB_API_KEY"
/// hint. The app remains fully functional without a calendar.
pub struct NoProvider;

#[async_trait]
impl EconProvider for NoProvider {
    fn label(&self) -> &'static str {
        "none"
    }

    async fn fetch(&self, _from: NaiveDate, _to: NaiveDate) -> Result<Vec<EconEvent>> {
        Ok(Vec::new())
    }
}
