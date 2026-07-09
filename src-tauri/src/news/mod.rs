//! News + economic events.
//!
//! - Headlines come from Yahoo's `/v1/finance/search` news array (no API key;
//!   reuses the REST client's cookie jar + crumb). We query a few related
//!   tickers/indices and merge+dedupe by link.
//! - Economic calendar comes from a pluggable `EconProvider`. The default is
//!   Finnhub (free API key via the `FINNHUB_API_KEY` env var). If no key is set
//!   the provider returns empty and the UI shows a hint — the app still works.
//!
//! The service fetches on start, then re-fetches news every 5 min and events
//! every 10 min, emitting `news` / `econ_events` Tauri events so the frontend
//! panel stays fresh without polling.

pub mod finnhub;
pub mod yahoo;

use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::yahoo::rest::RestClient;

/// A news headline.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NewsItem {
    pub title: String,
    pub publisher: String,
    pub link: String,
    pub time: i64, // unix seconds
    pub thumbnail: Option<String>,
}

/// An economic-calendar event (e.g. NFP, CPI, FOMC).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EconEvent {
    pub country: String,
    pub event: String,
    pub time: i64, // unix seconds (0 if undated)
    pub impact: String, // "high" | "medium" | "low" | ""
    pub actual: String,
    pub forecast: String,
    pub previous: String,
    pub unit: String,
}

/// Pluggable economic-calendar provider. Default impl: Finnhub. Swap in
/// Trading Economics / ForexFactory later by implementing this trait.
#[async_trait]
pub trait EconProvider: Send + Sync + 'static {
    async fn fetch(&self, from: NaiveDate, to: NaiveDate) -> Result<Vec<EconEvent>>;

    /// Human label for the UI hint when the provider has no data.
    fn label(&self) -> &'static str;
}

/// Owns the news + events fetch lifecycle.
#[derive(Clone)]
pub struct NewsService {
    rest: RestClient,
    econ: Arc<dyn EconProvider>,
    news: Arc<Mutex<Vec<NewsItem>>>,
    events: Arc<Mutex<Vec<EconEvent>>>,
}

impl NewsService {
    pub fn new(rest: RestClient) -> Self {
        let econ: Arc<dyn EconProvider> = match std::env::var("FINNHUB_API_KEY") {
            Ok(key) if !key.trim().is_empty() => Arc::new(finnhub::FinnhubProvider::new(key)),
            _ => Arc::new(finnhub::NoProvider),
        };
        Self {
            rest,
            econ,
            news: Arc::new(Mutex::new(Vec::new())),
            events: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Latest cached headlines (for the initial frontend render).
    pub async fn news(&self) -> Vec<NewsItem> {
        self.news.lock().await.clone()
    }

    /// Latest cached economic events.
    pub async fn events(&self) -> Vec<EconEvent> {
        self.events.lock().await.clone()
    }

    /// Provider label (shown by the UI when no calendar is available).
    pub fn econ_label(&self) -> &'static str {
        self.econ.label()
    }

    /// Start the periodic fetch loop. Fetches once on start, then news every
    /// 5 min and events every 10 min, emitting Tauri events each refresh.
    pub fn start(self, app: AppHandle) {
        // Initial fetch.
        {
            let app_n = app.clone();
            let svc_n = self.clone();
            tauri::async_runtime::spawn(async move {
                svc_n.refresh_news(&app_n).await;
            });
        }
        {
            let app_e = app.clone();
            let svc_e = self.clone();
            tauri::async_runtime::spawn(async move {
                svc_e.refresh_events(&app_e).await;
            });
        }

        // News every 5 min.
        {
            let app_n = app.clone();
            let svc_n = self.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
                interval.tick().await; // skip immediate (initial fetch handled it)
                loop {
                    interval.tick().await;
                    svc_n.refresh_news(&app_n).await;
                }
            });
        }

        // Events every 10 min.
        {
            let app_e = app.clone();
            let svc_e = self.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(600));
                interval.tick().await;
                loop {
                    interval.tick().await;
                    svc_e.refresh_events(&app_e).await;
                }
            });
        }
    }

    async fn refresh_news(&self, app: &AppHandle) {
        match yahoo::fetch_news(&self.rest).await {
            Ok(items) => {
                let _ = app.emit("news", items.clone());
                *self.news.lock().await = items;
            }
            Err(e) => {
                log::warn!("[news] yahoo fetch failed: {e}");
            }
        }
    }

    async fn refresh_events(&self, app: &AppHandle) {
        let today = Utc::now().date_naive();
        let to = today + chrono::Duration::days(2);
        match self.econ.fetch(today, to).await {
            Ok(events) => {
                let _ = app.emit("econ_events", events.clone());
                *self.events.lock().await = events;
            }
            Err(e) => {
                log::warn!("[news] econ fetch failed: {e}");
            }
        }
    }
}
