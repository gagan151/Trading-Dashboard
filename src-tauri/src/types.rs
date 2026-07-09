use serde::{Deserialize, Serialize};

/// A single OHLCV candle (unix seconds).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Candle {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: i64,
}

/// A real-time price update. Emitted to the frontend on the `tick` event.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tick {
    pub symbol: String,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
    pub day_high: f64,
    pub day_low: f64,
    pub previous_close: f64,
    pub open_price: f64,
    /// Unix seconds of the tick (or last trade time).
    pub time: i64,
    /// Yahoo market-hours encoding: 0 = regular, 1 = pre, 2 = post.
    pub market_hours: i32,
    /// "ws" (websocket) or "poll" (rest fallback).
    pub source: String,
}

/// Connection status emitted on the `connection` event.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub status: String,
    pub detail: String,
}
