use anyhow::{anyhow, Result};

use crate::types::{Candle, Tick};

const CHART_BASE: &str = "https://query1.finance.yahoo.com/v8/finance/chart";
const CRUMB_URL: &str = "https://query1.finance.yahoo.com/v1/test/getcrumb";
const COOKIE_SEED_URL: &str = "https://fc.yahoo.com/";
const UA: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) \
     Chrome/120.0.0.0 Safari/537.36";

/// Yahoo Finance REST client with a persistent cookie jar + cached crumb.
///
/// Yahoo's chart endpoint requires a cookie + crumb and rate-limits bursts
/// (HTTP 429). The crumb is fetched lazily and refreshed on 401/429.
#[derive(Clone)]
pub struct RestClient {
    client: reqwest::Client,
    crumb: std::sync::Arc<tokio::sync::Mutex<Option<String>>>,
}

impl RestClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(UA)
            .cookie_store(true)
            .gzip(true)
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("failed to build reqwest client");
        Self {
            client,
            crumb: std::sync::Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    async fn ensure_crumb(&self) -> Result<String> {
        let mut guard = self.crumb.lock().await;
        if let Some(c) = guard.clone() {
            return Ok(c);
        }
        // Seed cookies (a 404 is normal — it still sets the cookies we need).
        let _ = self.client.get(COOKIE_SEED_URL).send().await;
        let resp = self.client.get(CRUMB_URL).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("getcrumb status {}", resp.status()));
        }
        let crumb = resp.text().await?.trim().to_string();
        if crumb.is_empty() || crumb.contains("Too Many Requests") {
            return Err(anyhow!("invalid crumb: {crumb}"));
        }
        *guard = Some(crumb.clone());
        Ok(crumb)
    }

    async fn invalidate_crumb(&self) {
        *self.crumb.lock().await = None;
    }

    /// Fetch historical candles + meta. Retries once on 401/429 by refreshing the crumb.
    pub async fn chart(
        &self,
        symbol: &str,
        interval: &str,
        range: &str,
        include_prepost: bool,
    ) -> Result<ChartResponse> {
        let url = format!("{}/{}", CHART_BASE, symbol);
        for attempt in 0..2u32 {
            let crumb = self.ensure_crumb().await?;
            let resp = self
                .client
                .get(&url)
                .query(&[
                    ("interval", interval),
                    ("range", range),
                    ("includePrePost", if include_prepost { "true" } else { "false" }),
                    ("crumb", crumb.as_str()),
                ])
                .send()
                .await?;
            let status = resp.status();
            if status.as_u16() == 401 || status.as_u16() == 429 {
                self.invalidate_crumb().await;
                if attempt == 0 {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
                return Err(anyhow!("chart {symbol} rate-limited ({status}); retry later"));
            }
            if !status.is_success() {
                return Err(anyhow!("chart {symbol} status {status}"));
            }
            let json: serde_json::Value =
                resp.json().await.map_err(|e| anyhow!("chart {symbol} parse: {e}"))?;
            if let Some(err) = json.pointer("/chart/error") {
                return Err(anyhow!("yahoo chart error: {err}"));
            }
            let result = json
                .pointer("/chart/result/0")
                .ok_or_else(|| anyhow!("chart {symbol} no result"))?;
            return Ok(ChartResponse::from_json(result));
        }
        Err(anyhow!("chart {symbol} exhausted retries"))
    }

    /// Snapshot tick from the chart meta — used by the polling fallback.
    pub async fn snapshot(&self, symbol: &str) -> Result<Tick> {
        let cr = self.chart(symbol, "5m", "1d", true).await?;
        Ok(tick_from_meta(symbol, &cr.meta))
    }

    /// Generic authenticated GET returning raw JSON. Retries once on 401/429
    /// by refreshing the crumb. Used by the Yahoo search/news endpoint.
    pub async fn get_json(&self, url: &str, query: &[(&str, &str)]) -> Result<serde_json::Value> {
        for attempt in 0..2u32 {
            let crumb = self.ensure_crumb().await.ok();
            let mut req = self.client.get(url).query(query);
            if let Some(c) = crumb.as_deref() {
                req = req.query(&[("crumb", c)]);
            }
            let resp = req.send().await?;
            let status = resp.status();
            if status.as_u16() == 401 || status.as_u16() == 429 {
                self.invalidate_crumb().await;
                if attempt == 0 {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
                return Err(anyhow!("get_json {url} rate-limited ({status})"));
            }
            if !status.is_success() {
                return Err(anyhow!("get_json {url} status {status}"));
            }
            return resp
                .json::<serde_json::Value>()
                .await
                .map_err(|e| anyhow!("get_json {url} parse: {e}"));
        }
        Err(anyhow!("get_json {url} exhausted retries"))
    }
}

pub struct ChartResponse {
    pub candles: Vec<Candle>,
    pub meta: ChartMeta,
}

#[derive(Clone, Debug, Default)]
pub struct ChartMeta {
    pub regular_market_price: f64,
    pub previous_close: f64,
    pub chart_previous_close: f64,
    pub regular_market_time: i64,
    pub regular_market_open: f64,
    pub day_high: f64,
    pub day_low: f64,
    pub market_state: String,
    pub currency: String,
    pub exchange: String,
    pub instrument_type: String,
    pub exchange_tz: String,
}

impl ChartResponse {
    fn from_json(result: &serde_json::Value) -> Self {
        let timestamps: Vec<Option<i64>> = result
            .get("timestamp")
            .and_then(|t| t.as_array())
            .map(|a| a.iter().map(|v| v.as_i64()).collect())
            .unwrap_or_default();
        let quote = result.pointer("/indicators/quote/0");
        let opens = quote.and_then(|q| q.get("open")).and_then(|v| v.as_array());
        let highs = quote.and_then(|q| q.get("high")).and_then(|v| v.as_array());
        let lows = quote.and_then(|q| q.get("low")).and_then(|v| v.as_array());
        let closes = quote.and_then(|q| q.get("close")).and_then(|v| v.as_array());
        let volumes = quote.and_then(|q| q.get("volume")).and_then(|v| v.as_array());

        let mut candles = Vec::with_capacity(timestamps.len());
        for i in 0..timestamps.len() {
            let t = match timestamps.get(i).copied().flatten() {
                Some(t) => t,
                None => continue,
            };
            let c = get_f64(closes, i);
            if c.is_nan() {
                continue;
            }
            candles.push(Candle {
                time: t,
                open: get_f64(opens, i),
                high: get_f64(highs, i),
                low: get_f64(lows, i),
                close: c,
                volume: volumes
                    .and_then(|a| a.get(i))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0),
            });
        }
        let meta = parse_meta(result.get("meta"));
        ChartResponse { candles, meta }
    }
}

fn get_f64(arr: Option<&Vec<serde_json::Value>>, i: usize) -> f64 {
    arr.and_then(|a| a.get(i)).and_then(|v| v.as_f64()).unwrap_or(f64::NAN)
}

fn parse_meta(meta: Option<&serde_json::Value>) -> ChartMeta {
    let m = match meta {
        Some(m) => m,
        None => return ChartMeta::default(),
    };
    ChartMeta {
        regular_market_price: m.get("regularMarketPrice").and_then(|v| v.as_f64()).unwrap_or(f64::NAN),
        previous_close: m.get("previousClose").and_then(|v| v.as_f64()).unwrap_or(f64::NAN),
        chart_previous_close: m.get("chartPreviousClose").and_then(|v| v.as_f64()).unwrap_or(f64::NAN),
        regular_market_time: m.get("regularMarketTime").and_then(|v| v.as_i64()).unwrap_or(0),
        regular_market_open: m.get("regularMarketOpen").and_then(|v| v.as_f64()).unwrap_or(f64::NAN),
        day_high: m.get("regularMarketDayHigh").and_then(|v| v.as_f64()).unwrap_or(f64::NAN),
        day_low: m.get("regularMarketDayLow").and_then(|v| v.as_f64()).unwrap_or(f64::NAN),
        market_state: m.get("marketState").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        currency: m.get("currency").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        exchange: m.get("exchangeName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        instrument_type: m.get("instrumentType").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        exchange_tz: m.get("exchangeTimezoneName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    }
}

pub fn tick_from_meta(symbol: &str, m: &ChartMeta) -> Tick {
    let price = m.regular_market_price;
    let prev = if !m.previous_close.is_nan() {
        m.previous_close
    } else {
        m.chart_previous_close
    };
    let change = if !price.is_nan() && !prev.is_nan() { price - prev } else { f64::NAN };
    let change_pct = if !change.is_nan() && prev != 0.0 { change / prev * 100.0 } else { f64::NAN };
    Tick {
        symbol: symbol.to_string(),
        price,
        change,
        change_percent: change_pct,
        day_high: m.day_high,
        day_low: m.day_low,
        previous_close: prev,
        open_price: m.regular_market_open,
        time: if m.regular_market_time > 0 {
            m.regular_market_time
        } else {
            chrono::Utc::now().timestamp()
        },
        market_hours: encode_market_state(&m.market_state),
        source: "poll".to_string(),
    }
}

fn encode_market_state(state: &str) -> i32 {
    match state {
        "REGULAR" => 0,
        "PRE" | "PREPRE" => 1,
        "POST" | "POSTPOST" => 2,
        _ => 0,
    }
}
