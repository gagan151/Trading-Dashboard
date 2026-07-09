//! Resolve continuous futures symbols (e.g. `NQ=F`, `ES=F`) to the live
//! front-month CME contract symbol that Yahoo's streamer actually pushes
//! (e.g. `NQU26.CME`). The streamer does NOT push `=F` continuous symbols, so
//! we subscribe to the specific contract and rewrite the tick id back to the
//! continuous symbol so the rest of the app stays keyed by `NQ=F`/`ES=F`.
//!
//! Roll rule: CME e-mini index futures (NQ/ES) expire on the 3rd Friday of the
//! contract month (H=Mar, M=Jun, U=Sep, Z=Dec). The front month is the nearest
//! quarterly contract whose 3rd Friday has not yet passed. Resolved per launch;
//! restart the app after a quarterly roll to pick up the new front month.

use std::collections::HashMap;

use chrono::{Datelike, Duration, NaiveDate};

const QUARTERS: [(u32, char); 4] = [(3, 'H'), (6, 'M'), (9, 'U'), (12, 'Z')];

fn third_friday(year: i32, month: u32) -> NaiveDate {
    let first = NaiveDate::from_ymd_opt(year, month, 1).unwrap_or_else(|| NaiveDate::from_ymd_opt(year, 1, 1).unwrap());
    // num_days_from_monday(): Mon=0..Sun=6. Friday = 4.
    let dow = first.weekday().num_days_from_monday();
    let to_first_fri = ((4 + 7) - dow) % 7;
    let first_fri = first + Duration::days(to_first_fri as i64);
    first_fri + Duration::days(14)
}

/// Next quarterly (year, month, code) at or after the given (year, month).
fn next_quarter(year: i32, month: u32) -> (i32, u32, char) {
    for (m, c) in QUARTERS {
        if m >= month {
            return (year, m, c);
        }
    }
    (year + 1, 3, 'H')
}

/// Front-month CME contract symbol for a root (e.g. "NQ" -> "NQU26.CME").
pub fn front_month_contract(root: &str, today: NaiveDate) -> String {
    let mut year = today.year();
    let mut month = today.month();
    for _ in 0..8 {
        let (qy, qm, code) = next_quarter(year, month);
        if third_friday(qy, qm) >= today {
            return format!("{}{}{:02}.CME", root, code, qy % 100);
        }
        // advance past this quarter to search the next one
        year = if qm == 12 { qy + 1 } else { qy };
        month = if qm == 12 { 1 } else { qm + 1 };
    }
    // Fallback (shouldn't happen): nearest September.
    format!("{}U{:02}.CME", root, today.year() % 100)
}

/// Result of resolving the configured continuous symbols to live contracts.
pub struct ContractMap {
    /// contract symbol -> continuous symbol (e.g. "NQU26.CME" -> "NQ=F"), used
    /// both as the WS subscribe list (its keys) and to rewrite decoded tick
    /// ids back to the canonical app symbol.
    pub to_continuous: HashMap<String, String>,
}

/// Resolve a list of continuous futures symbols (`NQ=F`, `ES=F`, ...) to their
/// live front-month CME contracts. Non-`=F` symbols are passed through as-is.
pub fn resolve(symbols: &[String]) -> ContractMap {
    let today = chrono::Local::now().date_naive();
    let mut to_continuous = HashMap::new();
    for sym in symbols {
        if let Some(root) = sym.strip_suffix("=F") {
            let contract = front_month_contract(root, today);
            to_continuous.insert(contract, sym.clone());
        } else {
            // Non-futures (equities/indices) stream directly under their symbol.
            to_continuous.insert(sym.clone(), sym.clone());
        }
    }
    ContractMap { to_continuous }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn july_2026_front_is_sep() {
        // July 8 2026: June expired, September 3rd Fri (18th) not yet -> U26.
        let d = NaiveDate::from_ymd_opt(2026, 7, 8).unwrap();
        assert_eq!(front_month_contract("NQ", d), "NQU26.CME");
        assert_eq!(front_month_contract("ES", d), "ESU26.CME");
    }

    #[test]
    fn after_sep_expiry_rolls_to_dec() {
        // Sep 21 2026 (after 3rd Fri Sep 18) -> Z26.
        let d = NaiveDate::from_ymd_opt(2026, 9, 21).unwrap();
        assert_eq!(front_month_contract("NQ", d), "NQZ26.CME");
    }

    #[test]
    fn late_dec_rolls_to_next_year_march() {
        let d = NaiveDate::from_ymd_opt(2026, 12, 22).unwrap();
        assert_eq!(front_month_contract("NQ", d), "NQH27.CME");
    }

    #[test]
    fn resolve_maps_continuous_to_contract() {
        let m = resolve(&["NQ=F".to_string(), "ES=F".to_string()]);
        let nq_contract = m
            .to_continuous
            .keys()
            .find(|s| s.starts_with("NQ") && s.ends_with(".CME"))
            .unwrap();
        assert!(nq_contract.starts_with("NQ"));
        assert_eq!(m.to_continuous.get(nq_contract), Some(&"NQ=F".to_string()));
    }

    #[test]
    fn third_friday_is_correct() {
        // Sep 2026: 1st is Tue Sep 1. First Fri = Sep 4. 3rd Fri = Sep 18.
        assert_eq!(third_friday(2026, 9), NaiveDate::from_ymd_opt(2026, 9, 18).unwrap());
        // Mar 2026: 1st is Sun Mar 1. First Fri = Mar 6. 3rd Fri = Mar 20.
        assert_eq!(third_friday(2026, 3), NaiveDate::from_ymd_opt(2026, 3, 20).unwrap());
    }
}
