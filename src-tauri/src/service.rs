use std::sync::Arc;
use std::time::Duration as StdDuration;

use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::time::sleep;

use crate::ict::{self, EngineHandle, IctEngine};
use crate::yahoo::contract;
use crate::yahoo::rest::RestClient;
use crate::yahoo::ws;

/// Owns the Yahoo REST client, the ICT sweep engine, and the streaming
/// lifecycle (WebSocket + REST polling + ICT state emitter).
#[derive(Clone)]
pub struct DataService {
    pub rest: RestClient,
    pub engine: EngineHandle,
    running: Arc<Mutex<bool>>,
}

impl DataService {
    pub fn new() -> Self {
        Self {
            rest: RestClient::new(),
            engine: Arc::new(Mutex::new(IctEngine::new_empty())),
            running: Arc::new(Mutex::new(false)),
        }
    }

    /// Start the live data stream + ICT engine. Idempotent.
    pub async fn start(&self, app: AppHandle, symbols: Vec<String>) {
        let mut running = self.running.lock().await;
        if *running {
            return;
        }
        *running = true;
        drop(running);

        // Initialise per-symbol ICT state (level placeholders).
        {
            let mut e = self.engine.lock().await;
            e.init_symbols(&symbols);
        }

        // (1) WebSocket stream — primary, sub-second live ticks. Yahoo's
        //     streamer does not push `=F` continuous futures, so resolve each
        //     to its live front-month CME contract (e.g. NQ=F -> NQU26.CME)
        //     and subscribe to that; decoded tick ids are rewritten back to the
        //     continuous symbol inside run_ws.
        let cm = contract::resolve(&symbols);
        let app_ws = app.clone();
        let eng_ws = self.engine.clone();
        tauri::async_runtime::spawn(async move {
            ws::run_ws(app_ws, cm.to_continuous, eng_ws).await;
        });

        // (2) One-time daily seed: Previous Day / Previous Week highs & lows.
        let rest_d = self.rest.clone();
        let eng_d = self.engine.clone();
        let syms_d = symbols.clone();
        tauri::async_runtime::spawn(async move {
            sleep(StdDuration::from_secs(3)).await;
            for s in &syms_d {
                if let Ok(cr) = rest_d.chart(s, "1d", "1mo", false).await {
                    let mut e = eng_d.lock().await;
                    e.seed_daily(s, &cr.candles);
                }
            }
        });

        // (3) REST polling fallback (every 10s): snapshot tick + intraday
        //     Asia/London session highs/lows, then run sweep detection.
        let app_p = app.clone();
        let rest_p = self.rest.clone();
        let eng_p = self.engine.clone();
        let syms_p = symbols.clone();
        tauri::async_runtime::spawn(async move {
            // Let the WebSocket try first.
            sleep(StdDuration::from_secs(2)).await;
            let mut interval = tokio::time::interval(StdDuration::from_secs(10));
            loop {
                interval.tick().await;
                for s in &syms_p {
                    match rest_p.chart(s, "5m", "2d", true).await {
                        Ok(cr) => {
                            let tick = crate::yahoo::rest::tick_from_meta(s, &cr.meta);
                            let _ = app_p.emit("tick", tick.clone());
                            {
                                let mut e = eng_p.lock().await;
                                e.seed_intraday(s, &cr.candles);
                            }
                            ict::ingest_and_process(&app_p, &eng_p, &tick).await;
                        }
                        // REST is a secondary enrichment path (history +
                        // levels); the WebSocket owns the connection status. Log
                        // poll errors (commonly Yahoo 429 rate limits) without
                        // clobbering the WS "connected" pill.
                        Err(e) => {
                            log::warn!("[rest] poll {s}: {e}");
                        }
                    }
                }
            }
        });

        // (4) ICT state emitter (1s): live ET clock, active session, macro
        //     countdown, and current levels/sweeps for the frontend panels.
        let app_s = app.clone();
        let eng_s = self.engine.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                let state = {
                    let e = eng_s.lock().await;
                    e.build_state()
                };
                let _ = app_s.emit("ict_state", state);
                sleep(StdDuration::from_secs(1)).await;
            }
        });
    }
}
