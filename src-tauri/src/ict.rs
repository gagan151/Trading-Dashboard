//! ICT analytical engine.
//!
//! All times are New York / Eastern Time (auto DST via `America/New_York`),
//! because ICT kill zones and macro windows are defined in ET.
//!
//! Responsibilities:
//! - Classify the active kill zone and macro window (time-of-day).
//! - Compute session liquidity levels: Asia/London highs & lows (from intraday
//!   5m candles, locked once the session completes) and Previous Day / Previous
//!   Week highs & lows (from daily candles).
//! - Detect sweeps in real time on every tick and fire a native OS notification
//!   the moment a locked level is taken out, plus emit `sweep` / `ict_state`
//!   Tauri events so the frontend can render the liquidity + session panels and
//!   chart overlays.

use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Timelike, Utc};
use chrono_tz::America::New_York;
use chrono_tz::Tz as EtTz;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::types::{Candle, Tick};

type Minutes = u32;

/// Shared, thread-safe handle to the engine (owned by `DataService`).
pub type EngineHandle = Arc<Mutex<IctEngine>>;

// --------------------------------------------------------------------------
// ET time helpers
// --------------------------------------------------------------------------

fn et_now() -> DateTime<EtTz> {
    Utc::now().with_timezone(&New_York)
}

fn et_minutes(t: DateTime<EtTz>) -> Minutes {
    t.naive_local().num_seconds_from_midnight() / 60
}

fn et_unix_for_date(d: NaiveDate, minutes: Minutes) -> i64 {
    let time = NaiveTime::from_hms_opt(0, 0, 0).unwrap() + Duration::minutes(minutes as i64);
    let ndt = NaiveDateTime::new(d, time);
    New_York
        .from_local_datetime(&ndt)
        .earliest()
        .map(|x| x.timestamp())
        .unwrap_or(0)
}

fn et_unix(t: DateTime<EtTz>, day_offset: i64, minutes: Minutes) -> i64 {
    et_unix_for_date(t.date_naive() + Duration::days(day_offset), minutes)
}

fn et_date_of_unix(ts: i64) -> NaiveDate {
    DateTime::<Utc>::from_timestamp(ts, 0)
        .unwrap_or_else(Utc::now)
        .with_timezone(&New_York)
        .date_naive()
}

fn et_from_unix(ts: i64) -> DateTime<EtTz> {
    DateTime::<Utc>::from_timestamp(ts, 0)
        .unwrap_or_else(Utc::now)
        .with_timezone(&New_York)
}

// --------------------------------------------------------------------------
// Canonical ICT windows (ET minutes since midnight). ictkillzone.com values.
// --------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Window {
    name: &'static str,
    start: Minutes,
    end: Minutes,
}

/// ICT kill zones. Asia runs 20:00-00:00 ET (crosses midnight, represented as
/// 1200..1440). London Open 02:00-05:00. NY AM 08:30-11:00. London Close
/// 10:00-12:00. NY PM 13:30-16:00.
const KILLZONES: &[Window] = &[
    Window { name: "Asia", start: 1200, end: 1440 },
    Window { name: "London Open", start: 120, end: 300 },
    Window { name: "New York AM", start: 510, end: 660 },
    Window { name: "London Close", start: 600, end: 720 },
    Window { name: "New York PM", start: 810, end: 960 },
];

#[derive(Clone, Copy)]
struct Macro {
    label: &'static str,
    start: Minutes,
    end: Minutes,
}

/// ICT macro windows (~20 min). "Asian Macro" is 19:50-20:10 ET (the plan's
/// "7:50-8:10" interpreted as PM, bracketing the Asia kill-zone open).
const MACROS: &[Macro] = &[
    Macro { label: "London Macro 1", start: 153, end: 180 }, // 02:33-03:00
    Macro { label: "London Macro 2", start: 243, end: 270 }, // 04:03-04:30
    Macro { label: "NY AM Macro 1", start: 530, end: 550 },  // 08:50-09:10
    Macro { label: "NY AM Macro 2", start: 590, end: 610 },  // 09:50-10:10 (Silver Bullet)
    Macro { label: "NY AM Macro 3", start: 650, end: 670 },  // 10:50-11:10
    Macro { label: "NY AM Macro 4", start: 710, end: 730 },  // 11:50-12:10
    Macro { label: "NY PM Macro 1", start: 790, end: 820 },  // 13:10-13:40
    Macro { label: "NY PM Macro 2", start: 915, end: 945 },  // 15:15-15:45
    Macro { label: "Asian Macro", start: 1190, end: 1210 },  // 19:50-20:10
];

/// Intraday session windows used for Asia/London high-low tracking.
const ASIA_SESSION: (Minutes, Minutes) = (1200, 1440); // 20:00-00:00 ET
const LONDON_SESSION: (Minutes, Minutes) = (120, 300); // 02:00-05:00 ET

fn macros_sorted() -> Vec<&'static Macro> {
    let mut v: Vec<&Macro> = MACROS.iter().collect();
    v.sort_by_key(|m| m.start);
    v
}

// --------------------------------------------------------------------------
// Public state payload (emitted as `ict_state` + returned by get_ict_state)
// --------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LevelInfo {
    pub kind: String, // "Asia" | "London" | "PD" | "PW"
    pub side: String, // "high" | "low"
    pub value: f64,
    pub present: bool,
    pub swept: bool,
    pub swept_at: Option<i64>,
    pub locked: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SymbolIct {
    pub last_price: f64,
    pub levels: Vec<LevelInfo>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KillzoneInfo {
    pub name: String,
    pub start: i64,
    pub end: i64,
    pub active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MacroInfo {
    pub label: String,
    pub start: i64,
    pub end: i64,
    pub status: String, // "active" | "done" | "upcoming"
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NextMacro {
    pub label: String,
    pub start: i64,
    pub seconds_until: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IctState {
    pub et_time: String,
    pub et_date: String,
    pub active_session: String,
    pub today_killzones: Vec<KillzoneInfo>,
    pub today_macros: Vec<MacroInfo>,
    pub next_macro: Option<NextMacro>,
    pub symbols: BTreeMap<String, SymbolIct>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Sweep {
    pub symbol: String,
    pub kind: String,
    pub side: String,
    pub value: f64,
    pub price: f64,
    pub time: i64,
}

// --------------------------------------------------------------------------
// Engine state
// --------------------------------------------------------------------------

const LEVEL_DEFS: &[(&str, &str)] = &[
    ("Asia", "high"),
    ("Asia", "low"),
    ("London", "high"),
    ("London", "low"),
    ("PD", "high"),
    ("PD", "low"),
    ("PW", "high"),
    ("PW", "low"),
];

#[derive(Clone)]
struct Level {
    kind: &'static str,
    side: &'static str,
    value: Option<f64>,
    swept: bool,
    swept_at: Option<i64>,
    /// When the forming session completes (Asia/London). `None` for PD/PW
    /// (static historical levels, locked as soon as a value exists).
    session_end: Option<i64>,
    /// Trading-day key (yyyymmdd) for Asia/London, to detect a new session and
    /// reset the swept flag. 0 for PD/PW.
    key_tag: i64,
}

impl Level {
    fn locked(&self, now_unix: i64) -> bool {
        match self.session_end {
            Some(end) => now_unix >= end,
            None => self.value.is_some(),
        }
    }
}

#[derive(Clone)]
struct SymbolState {
    last_price: f64,
    levels: Vec<Level>,
}

impl SymbolState {
    fn new() -> Self {
        let levels = LEVEL_DEFS
            .iter()
            .map(|(kind, side)| Level {
                kind,
                side,
                value: None,
                swept: false,
                swept_at: None,
                // Asia/London start locked-pending-value; PD/PW lock on value.
                session_end: if *kind == "Asia" || *kind == "London" { Some(0) } else { None },
                key_tag: 0,
            })
            .collect();
        Self { last_price: 0.0, levels }
    }

    fn level_mut(&mut self, kind: &str, side: &str) -> Option<&mut Level> {
        self.levels.iter_mut().find(|l| l.kind == kind && l.side == side)
    }
}

pub struct IctEngine {
    symbols: BTreeMap<String, SymbolState>,
    notifications_enabled: Arc<AtomicBool>,
}

impl IctEngine {
    pub fn new_empty() -> Self {
        Self {
            symbols: BTreeMap::new(),
            notifications_enabled: Arc::new(AtomicBool::new(true)),
        }
    }

    /// Toggle native OS notifications on sweep detection (driven by Settings).
    pub fn set_notifications_enabled(&self, enabled: bool) {
        self.notifications_enabled.store(enabled, Ordering::Relaxed);
    }

    pub fn notifications_enabled(&self) -> bool {
        self.notifications_enabled.load(Ordering::Relaxed)
    }

    /// Populate the per-symbol state once at stream start (idempotent).
    pub fn init_symbols(&mut self, symbols: &[String]) {
        for s in symbols {
            self.symbols
                .entry(s.to_string())
                .or_insert_with(SymbolState::new);
        }
    }

    /// Seed Previous Day / Previous Week highs & lows from daily candles.
    pub fn seed_daily(&mut self, symbol: &str, daily: &[Candle]) {
        let now = et_now();
        let today = now.date_naive();

        // PDH/PDL = most recent completed trading day (strictly before today).
        let pd = daily
            .iter()
            .filter(|c| et_date_of_unix(c.time) < today)
            .last();

        // PWH/PWL = most recent completed ISO week (before the current week).
        let cur_week = today.iso_week();
        let mut pw_week: Option<(i32, u32)> = None;
        let mut pw_high = f64::NEG_INFINITY;
        let mut pw_low = f64::INFINITY;
        for c in daily {
            let d = et_date_of_unix(c.time);
            if d >= today {
                continue;
            }
            let iw = d.iso_week();
            let key = (iw.year(), iw.week());
            if key == (cur_week.year(), cur_week.week()) {
                continue; // current (incomplete) week
            }
            if Some(key) > pw_week {
                pw_week = Some(key);
                pw_high = c.high;
                pw_low = c.low;
            } else if Some(key) == pw_week {
                pw_high = pw_high.max(c.high);
                pw_low = pw_low.min(c.low);
            }
        }
        let pw_present = pw_week.is_some();

        if let Some(st) = self.symbols.get_mut(symbol) {
            if let Some(c) = pd {
                if let Some(l) = st.level_mut("PD", "high") {
                    l.value = Some(c.high);
                }
                if let Some(l) = st.level_mut("PD", "low") {
                    l.value = Some(c.low);
                }
            }
            if pw_present {
                if let Some(l) = st.level_mut("PW", "high") {
                    l.value = Some(pw_high);
                }
                if let Some(l) = st.level_mut("PW", "low") {
                    l.value = Some(pw_low);
                }
            }
        }
    }

    /// Seed Asia/London highs & lows from intraday 5m candles. Picks the most
    /// recent session of each kind (forming or complete) and computes its H/L.
    /// A level is `locked` (sweepable) only once its session has completed.
    pub fn seed_intraday(&mut self, symbol: &str, candles: &[Candle]) {
        // Bucket candles by (kind, trading_day). Asia 20:00-00:00 keys to the
        // *next* calendar date (the NY cash day it precedes); London 02:00-05:00
        // keys to the same date, so both align on the same trading day.
        let mut buckets: HashMap<(&str, NaiveDate), (f64, f64)> = HashMap::new();
        for c in candles {
            let et = et_from_unix(c.time);
            let h = et.hour();
            let key = match h {
                20..=23 => ("Asia", et.date_naive() + Duration::days(1)),
                2..=4 => ("London", et.date_naive()),
                _ => continue,
            };
            let e = buckets.entry(key).or_insert((f64::NEG_INFINITY, f64::INFINITY));
            e.0 = e.0.max(c.high);
            e.1 = e.1.min(c.low);
        }

        let mut asia_best: Option<(NaiveDate, (f64, f64))> = None;
        let mut lon_best: Option<(NaiveDate, (f64, f64))> = None;
        for ((kind, key), hl) in &buckets {
            if *kind == "Asia" && asia_best.as_ref().map_or(true, |(k, _)| key > k) {
                asia_best = Some((*key, *hl));
            }
            if *kind == "London" && lon_best.as_ref().map_or(true, |(k, _)| key > k) {
                lon_best = Some((*key, *hl));
            }
        }

        let set_session = |st: &mut SymbolState,
                           kind: &str,
                           side: &str,
                           val: f64,
                           key: NaiveDate,
                           end_minutes: Minutes| {
            if let Some(l) = st.level_mut(kind, side) {
                let new_tag = date_tag(key);
                if l.key_tag != new_tag {
                    // New session: reset sweep state.
                    l.swept = false;
                    l.swept_at = None;
                    l.key_tag = new_tag;
                }
                l.value = Some(val);
                l.session_end = Some(et_unix_for_date(key, end_minutes));
            }
        };

        if let Some((key, (hi, lo))) = asia_best {
            if let Some(st) = self.symbols.get_mut(symbol) {
                set_session(st, "Asia", "high", hi, key, ASIA_SESSION.1); // ends 00:00
                set_session(st, "Asia", "low", lo, key, ASIA_SESSION.1);
            }
        }
        if let Some((key, (hi, lo))) = lon_best {
            if let Some(st) = self.symbols.get_mut(symbol) {
                set_session(st, "London", "high", hi, key, LONDON_SESSION.1); // ends 05:00
                set_session(st, "London", "low", lo, key, LONDON_SESSION.1);
            }
        }
    }

    /// Run sweep detection on a tick. Returns any newly-swept levels.
    pub fn ingest_tick(&mut self, tick: &Tick) -> Vec<Sweep> {
        let now_unix = et_now().timestamp();
        let mut sweeps = Vec::new();
        let Some(st) = self.symbols.get_mut(&tick.symbol) else {
            return sweeps;
        };
        if !tick.price.is_finite() {
            return sweeps;
        }
        st.last_price = tick.price;
        for lvl in st.levels.iter_mut() {
            let Some(value) = lvl.value else { continue };
            if lvl.swept || !lvl.locked(now_unix) {
                continue;
            }
            let crossed = if lvl.side == "high" {
                tick.price >= value
            } else {
                tick.price <= value
            };
            if crossed {
                let t = tick.time.max(now_unix);
                lvl.swept = true;
                lvl.swept_at = Some(t);
                sweeps.push(Sweep {
                    symbol: tick.symbol.clone(),
                    kind: lvl.kind.to_string(),
                    side: lvl.side.to_string(),
                    value,
                    price: tick.price,
                    time: t,
                });
            }
        }
        sweeps
    }

    /// Build the full state snapshot for the frontend.
    pub fn build_state(&self) -> IctState {
        let now = et_now();
        let mins = et_minutes(now);
        let now_unix = now.timestamp();

        let today_killzones: Vec<KillzoneInfo> = KILLZONES
            .iter()
            .map(|w| KillzoneInfo {
                name: w.name.to_string(),
                start: et_unix(now, 0, w.start),
                end: et_unix(now, 0, w.end),
                active: mins >= w.start && mins < w.end,
            })
            .collect();

        let sorted = macros_sorted();
        let today_macros: Vec<MacroInfo> = sorted
            .iter()
            .map(|m| {
                let status = if mins >= m.start && mins < m.end {
                    "active"
                } else if mins >= m.end {
                    "done"
                } else {
                    "upcoming"
                };
                MacroInfo {
                    label: m.label.to_string(),
                    start: et_unix(now, 0, m.start),
                    end: et_unix(now, 0, m.end),
                    status: status.to_string(),
                }
            })
            .collect();

        let next_macro = sorted
            .iter()
            .find(|m| mins < m.start)
            .map(|m| NextMacro {
                label: m.label.to_string(),
                start: et_unix(now, 0, m.start),
                seconds_until: (et_unix(now, 0, m.start) - now_unix).max(0),
            })
            .or_else(|| {
                sorted.first().map(|m| NextMacro {
                    label: m.label.to_string(),
                    start: et_unix(now, 1, m.start),
                    seconds_until: (et_unix(now, 1, m.start) - now_unix).max(0),
                })
            });

        let active_session = KILLZONES
            .iter()
            .find(|w| mins >= w.start && mins < w.end)
            .map(|w| w.name.to_string())
            .unwrap_or_else(|| "Dead Zone".to_string());

        let mut symbols = BTreeMap::new();
        for (sym, st) in &self.symbols {
            let levels = st
                .levels
                .iter()
                .map(|l| LevelInfo {
                    kind: l.kind.to_string(),
                    side: l.side.to_string(),
                    value: l.value.unwrap_or(f64::NAN),
                    present: l.value.is_some(),
                    swept: l.swept,
                    swept_at: l.swept_at,
                    locked: l.locked(now_unix),
                })
                .collect();
            symbols.insert(
                sym.clone(),
                SymbolIct {
                    last_price: st.last_price,
                    levels,
                },
            );
        }

        IctState {
            et_time: now.format("%H:%M:%S").to_string(),
            et_date: now.format("%Y-%m-%d").to_string(),
            active_session,
            today_killzones,
            today_macros,
            next_macro,
            symbols,
        }
    }
}

fn date_tag(d: NaiveDate) -> i64 {
    (d.year() as i64) * 10000 + (d.month() as i64) * 100 + (d.day() as i64)
}

// --------------------------------------------------------------------------
// Sweep side-effects: native notification + events
// --------------------------------------------------------------------------

fn fire_notification(app: &AppHandle, s: &Sweep) {
    use tauri_plugin_notification::NotificationExt;
    let dir = if s.side == "high" { "high" } else { "low" };
    let title = format!("{} {} {} swept", s.symbol, s.kind, dir);
    let body = format!(
        "Price {:.2} took out the {} {} ({:.2})",
        s.price, s.kind, dir, s.value
    );
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Ingest a tick and, if it swept any level, fire notifications + emit events.
/// Notifications are gated by the engine's `notifications_enabled` flag.
pub async fn ingest_and_process(app: &AppHandle, engine: &EngineHandle, tick: &Tick) {
    let (sweeps, notify) = {
        let mut e = engine.lock().await;
        (e.ingest_tick(tick), e.notifications_enabled())
    };
    if sweeps.is_empty() {
        return;
    }
    for s in &sweeps {
        if notify {
            fire_notification(app, s);
        }
        let _ = app.emit("sweep", s.clone());
    }
    let state = {
        let e = engine.lock().await;
        e.build_state()
    };
    let _ = app.emit("ict_state", state);
}
