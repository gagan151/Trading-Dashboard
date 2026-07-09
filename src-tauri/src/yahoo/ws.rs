use std::collections::HashMap;

use anyhow::Result;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use prost::Message;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

use crate::ict::{self, EngineHandle};
use crate::types::{ConnectionStatus, Tick};
use crate::yahoo::proto::PricingData;

const URL: &str = "wss://streamer.finance.yahoo.com/?version=2";

/// Run the WebSocket forever, reconnecting with a small backoff after drops.
/// `to_continuous` maps the symbols we subscribe to (e.g. front-month contracts
/// `NQU26.CME`) back to the canonical app symbol (e.g. `NQ=F`) so decoded ticks
/// are rewritten before being emitted. Yahoo's streamer does not push `=F`
/// continuous futures, so we subscribe to the resolved live contracts instead.
pub async fn run_ws(
    app: AppHandle,
    to_continuous: HashMap<String, String>,
    engine: EngineHandle,
) {
    let subscribe: Vec<String> = to_continuous.keys().cloned().collect();
    loop {
        match connect_once(&app, &subscribe, &to_continuous, &engine).await {
            Ok(()) => {
                let _ = app.emit(
                    "connection",
                    ConnectionStatus {
                        status: "reconnecting".into(),
                        detail: "websocket closed; reconnecting".into(),
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "connection",
                    ConnectionStatus {
                        status: "reconnecting".into(),
                        detail: format!("ws error: {e}"),
                    },
                );
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
}

async fn connect_once(
    app: &AppHandle,
    subscribe: &[String],
    to_continuous: &HashMap<String, String>,
    engine: &EngineHandle,
) -> Result<()> {
    let (ws, _resp) = connect_async(URL).await?;
    log::info!("[ws] connected; subscribing {:?}", subscribe);
    let _ = app.emit(
        "connection",
        ConnectionStatus {
            status: "connected".into(),
            detail: "websocket".into(),
        },
    );
    let (mut write, mut read) = ws.split();

    // Initial subscribe.
    let sub = serde_json::json!({ "subscribe": subscribe }).to_string();
    write.send(WsMessage::Text(sub.into())).await?;

    // Heartbeat: re-send subscribe every 15s (keeps the stream alive, like yfinance).
    let mut heartbeat = tokio::time::interval(std::time::Duration::from_secs(15));
    heartbeat.tick().await; // discard the immediate first tick.

    loop {
        tokio::select! {
            msg = read.next() => {
                let Some(msg) = msg else { break; };
                let msg = msg?;
                match msg {
                    WsMessage::Text(text) => {
                        if let Some(mut tick) = decode_text(&*text) {
                            rewrite_symbol(&mut tick, to_continuous);
                            let _ = app.emit("tick", tick.clone());
                            ict::ingest_and_process(app, engine, &tick).await;
                        }
                    }
                    WsMessage::Binary(b) => {
                        if let Some(mut tick) = decode_bytes(&*b) {
                            rewrite_symbol(&mut tick, to_continuous);
                            let _ = app.emit("tick", tick.clone());
                            ict::ingest_and_process(app, engine, &tick).await;
                        }
                    }
                    WsMessage::Ping(_) | WsMessage::Pong(_) => {}
                    WsMessage::Close(_) => break,
                    _ => {}
                }
            }
            _ = heartbeat.tick() => {
                let sub = serde_json::json!({ "subscribe": subscribe }).to_string();
                if write.send(WsMessage::Text(sub.into())).await.is_err() {
                    break;
                }
            }
        }
    }
    Ok(())
}

/// Rewrite a decoded tick's symbol from the subscribed contract symbol (e.g.
/// `NQU26.CME`) back to the canonical continuous symbol (e.g. `NQ=F`). Falls
/// back to the raw id if no mapping is present (equities/indices).
fn rewrite_symbol(tick: &mut Tick, to_continuous: &HashMap<String, String>) {
    if let Some(canonical) = to_continuous.get(&tick.symbol) {
        tick.symbol = canonical.clone();
    }
}

/// A frame is JSON `{"message":"<base64>"}` (v2). Older/raw frames are plain base64.
fn decode_text(text: &str) -> Option<Tick> {
    let b64 = if text.trim_start().starts_with('{') {
        serde_json::from_str::<serde_json::Value>(text)
            .ok()?
            .get("message")?
            .as_str()?
            .to_string()
    } else {
        text.trim().to_string()
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .ok()?;
    decode_bytes(&bytes)
}

fn decode_bytes(bytes: &[u8]) -> Option<Tick> {
    let pd = PricingData::decode(bytes).ok()?;
    Some(pricing_to_tick(&pd))
}

fn pricing_to_tick(pd: &PricingData) -> Tick {
    Tick {
        symbol: pd.id.clone(),
        price: pd.price as f64,
        change: pd.change as f64,
        change_percent: pd.change_percent as f64,
        day_high: pd.day_high as f64,
        day_low: pd.day_low as f64,
        previous_close: pd.previous_close as f64,
        open_price: pd.open_price as f64,
        time: pd.time,
        market_hours: pd.market_hours,
        source: "ws".to_string(),
    }
}

