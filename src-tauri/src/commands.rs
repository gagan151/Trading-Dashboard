use tauri::{AppHandle, State};

use crate::ict::IctState;
use crate::news::{EconEvent, NewsItem, NewsService};
use crate::service::DataService;
use crate::types::{Candle, Tick};

/// Fetch historical candles for a symbol (interval e.g. "5m", range e.g. "1d").
#[tauri::command]
pub async fn get_history(
    state: State<'_, DataService>,
    symbol: String,
    interval: String,
    range: String,
) -> Result<Vec<Candle>, String> {
    let cr = state
        .rest
        .chart(&symbol, &interval, &range, true)
        .await
        .map_err(|e| e.to_string())?;
    Ok(cr.candles)
}

/// One-shot quote snapshot (used for initial render before ticks arrive).
#[tauri::command]
pub async fn get_quote(state: State<'_, DataService>, symbol: String) -> Result<Tick, String> {
    state.rest.snapshot(&symbol).await.map_err(|e| e.to_string())
}

/// Start the live WebSocket + polling stream for the given symbols.
#[tauri::command]
pub async fn start_stream(
    state: State<'_, DataService>,
    app: AppHandle,
    symbols: Vec<String>,
) -> Result<(), String> {
    state.start(app, symbols).await;
    Ok(())
}

/// Current ICT state: active session, macro windows, and per-symbol liquidity
/// levels with swept/unswept status (for initial render before the 1s events).
#[tauri::command]
pub async fn get_ict_state(state: State<'_, DataService>) -> Result<IctState, String> {
    let eng = state.engine.lock().await;
    Ok(eng.build_state())
}

/// Latest cached Yahoo news headlines (for initial render before the events).
#[tauri::command]
pub async fn get_news(state: State<'_, NewsService>) -> Result<Vec<NewsItem>, String> {
    Ok(state.news().await)
}

/// Latest cached economic-calendar events (Finnhub, if a key is set).
#[tauri::command]
pub async fn get_econ_events(state: State<'_, NewsService>) -> Result<Vec<EconEvent>, String> {
    Ok(state.events().await)
}

/// Active economic-provider label (e.g. "Finnhub" or "none"), so the UI can
/// show a "set FINNHUB_API_KEY" hint when no calendar source is configured.
#[tauri::command]
pub fn get_econ_provider_label(state: State<'_, NewsService>) -> Result<&'static str, String> {
    Ok(state.econ_label())
}

/// Enable/disable native OS notifications on sweep detection (Settings toggle).
#[tauri::command]
pub async fn set_notifications_enabled(
    state: State<'_, DataService>,
    enabled: bool,
) -> Result<(), String> {
    let eng = state.engine.lock().await;
    eng.set_notifications_enabled(enabled);
    Ok(())
}
