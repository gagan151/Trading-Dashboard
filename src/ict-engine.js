const { DateTime } = require('luxon');
const C = require('./config');
const ET = 'America/New_York';

// ── helpers ─────────────────────────────────────────────────────────
const m = (h, mn) => h * 60 + mn;
const r2 = (v) => (v != null ? Math.round(v * 100) / 100 : null);
const cd = (mins) => {
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60), mn = mins % 60;
  return h > 0 ? `${h}h ${mn}m` : `${mn}m`;
};
const near = (price, level) =>
  price != null && level != null && level !== 0 &&
  Math.abs(price - level) / Math.abs(level) <= C.PROXIMITY_PCT;

function toET(date) {
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(ET);
}

// ── engine ──────────────────────────────────────────────────────────
class ICTEngine {
  compute(data) {
    const now = DateTime.now().setZone(ET);
    const { intraday = {}, daily = {}, weekly = {} } = data;

    const result = {
      time: now.toFormat('hh:mm:ss a'),
      date: now.toFormat('cccc, LLL dd'),
      kill_zones: this._kz(now),
      macros: this._macros(now),
      tickers: {},
    };

    for (const ticker of C.TICKERS) {
      const label = C.TICKER_LABELS[ticker];
      const intra = intraday[ticker] || [];
      const day = daily[ticker] || [];
      const week = weekly[ticker] || [];

      let price = null;
      if (intra.length) price = r2(intra[intra.length - 1].close);

      let daily_change = 0;
      const pc = this._prevClose(day, now);
      if (pc && price) daily_change = r2(((price - pc) / pc) * 100);

      const raw = this._levels(day, week, now);
      const liquidity = this._sweeps(intra, raw, now);
      const ote = this._ote(intra, price);
      const key_opens = this._opens(intra, price, now);
      const po3 = this._po3(intra, now);

      const levels = {};
      for (const [k, v] of Object.entries(raw)) {
        levels[k] = { value: v, near: near(price, v) };
      }

      result.tickers[ticker] = { label, price, daily_change, levels, liquidity, ote, key_opens, po3 };
    }

    // SMT divergence detection
    result.smt_warnings = this._detectSMT(result.tickers);

    return result;
  }

  // ── SMT divergence ───────────────────────────────────────────────
  _detectSMT(tickers) {
    const warnings = [];
    const nq = tickers['NQ=F'];
    const es = tickers['ES=F'];
    
    if (!nq?.liquidity || !es?.liquidity) return warnings;

    // Compare each liquidity level between NQ and ES
    const nqLiq = nq.liquidity;
    const esLiq = es.liquidity;

    for (const nqLevel of nqLiq) {
      const esLevel = esLiq.find(e => e.label === nqLevel.label);
      if (!esLevel || nqLevel.status === 'N/A' || esLevel.status === 'N/A') continue;

      // SMT: One swept, other not
      if (nqLevel.swept && !esLevel.swept) {
        warnings.push({
          level: nqLevel.label,
          message: `NQ swept ${nqLevel.label}, ES did not`,
          type: 'divergence'
        });
      } else if (!nqLevel.swept && esLevel.swept) {
        warnings.push({
          level: esLevel.label,
          message: `ES swept ${esLevel.label}, NQ did not`,
          type: 'divergence'
        });
      }
    }

    return warnings;
  }

  // ── kill zones ──────────────────────────────────────────────────
  _kz(now) {
    const nm = m(now.hour, now.minute);
    return C.KILL_ZONES.map((kz) => {
      const s = m(...kz.start), e = m(...kz.end);
      if (kz.crossesMidnight) {
        if (nm >= s || nm < e) {
          const rem = nm >= s ? 1440 - nm + e : e - nm;
          return { name: kz.name, status: 'ACTIVE', countdown: cd(rem), active: true };
        }
        const rem = nm < s ? s - nm : 1440 - nm + s;
        return { name: kz.name, status: 'upcoming', countdown: cd(rem), active: false };
      }
      if (s <= nm && nm < e)
        return { name: kz.name, status: 'ACTIVE', countdown: cd(e - nm), active: true };
      if (nm < s)
        return { name: kz.name, status: 'upcoming', countdown: cd(s - nm), active: false };
      return { name: kz.name, status: 'closed', countdown: '', active: false };
    });
  }

  // ── macros ──────────────────────────────────────────────────────
  _macros(now) {
    const nm = m(now.hour, now.minute);
    return C.MACRO_TIMES.map((mt) => {
      const s = m(...mt.start), e = m(...mt.end);
      if (s <= nm && nm < e)
        return { label: mt.label, status: 'ACTIVE', countdown: cd(e - nm), active: true };
      if (nm < s)
        return { label: mt.label, status: 'upcoming', countdown: cd(s - nm), active: false };
      return { label: mt.label, status: 'closed', countdown: '', active: false };
    });
  }

  // ── prev close ──────────────────────────────────────────────────
  _prevClose(day, now) {
    if (!day.length) return null;
    const last = toET(day[day.length - 1].date);
    const idx = last.hasSame(now, 'day') && day.length >= 2 ? day.length - 2 : day.length - 1;
    return idx >= 0 ? day[idx]?.close ?? null : null;
  }

  // ── key levels ──────────────────────────────────────────────────
  _levels(day, week, now) {
    const lv = {};
    if (day.length) {
      const last = toET(day[day.length - 1].date);
      const idx = last.hasSame(now, 'day') && day.length >= 2 ? day.length - 2 : day.length - 1;
      if (idx >= 0) {
        const d = day[idx];
        lv.pdh = r2(d.high); lv.pdl = r2(d.low); lv.pdo = r2(d.open); lv.pdc = r2(d.close);
      }
    }
    if (week.length >= 2) {
      const w = week[week.length - 2];
      lv.pwh = r2(w.high); lv.pwl = r2(w.low); lv.pwo = r2(w.open); lv.pwc = r2(w.close);
    }
    return lv;
  }

  // ── liquidity sweeps ────────────────────────────────────────────
  _sweeps(intra, levels, now) {
    if (!intra.length) return [];
    const today = now.startOf('day');
    const yest = today.weekday === 1 ? today.minus({ days: 3 }) : today.minus({ days: 1 });

    const sess = [
      ['Asia High',   yest, [19, 0], today, [0, 0], 'high'],
      ['Asia Low',    yest, [19, 0], today, [0, 0], 'low'],
      ['London High', today, [2, 0], today, [5, 0], 'high'],
      ['London Low',  today, [2, 0], today, [5, 0], 'low'],
    ];

    const out = [];
    for (const [label, sd, st, ed, et_, side] of sess) {
      try {
        let s = sd.set({ hour: st[0], minute: st[1] });
        let e = ed.set({ hour: et_[0], minute: et_[1] });
        if (e <= s) e = e.plus({ days: 1 });

        // candles DURING the session → find the level
        const seg = intra.filter((c) => { const t = toET(c.date); return t >= s && t < e; });
        if (!seg.length) { out.push({ label, level: null, swept: false, status: 'N/A' }); continue; }

        // candles AFTER the session ended → check for sweep
        const after = intra.filter((c) => toET(c.date) >= e);
        const afterHi = after.length ? Math.max(...after.map((c) => c.high)) : null;
        const afterLo = after.length ? Math.min(...after.map((c) => c.low)) : null;

        if (side === 'high') {
          const lv = r2(Math.max(...seg.map((c) => c.high)));
          const swept = afterHi != null && afterHi > lv;
          out.push({ label, level: lv, swept, status: swept ? 'SWEPT' : 'Unswept' });
        } else {
          const lv = r2(Math.min(...seg.map((c) => c.low)));
          const swept = afterLo != null && afterLo < lv;
          out.push({ label, level: lv, swept, status: swept ? 'SWEPT' : 'Unswept' });
        }
      } catch { out.push({ label, level: null, swept: false, status: 'N/A' }); }
    }

    // PDH/PDL — check all candles from today's futures open (18:00 ET yesterday)
    const futuresOpen = yest.set({ hour: 18, minute: 0 });
    const todayCandles = intra.filter((c) => toET(c.date) >= futuresOpen);
    const todayHi = todayCandles.length ? Math.max(...todayCandles.map((c) => c.high)) : null;
    const todayLo = todayCandles.length ? Math.min(...todayCandles.map((c) => c.low)) : null;

    for (const [key, side] of [['pdh', 'high'], ['pdl', 'low']]) {
      const val = levels[key];
      if (val == null) continue;
      const swept = side === 'high' ? (todayHi != null && todayHi > val) : (todayLo != null && todayLo < val);
      out.push({ label: key.toUpperCase(), level: val, swept, status: swept ? 'SWEPT' : 'Unswept' });
    }
    return out;
  }

  // ── OTE ─────────────────────────────────────────────────────────
  _ote(intra, price) {
    if (!intra.length || price == null) return { available: false };
    try {
      const c5 = this._resample(intra, 5);
      const n = C.SWING_LOOKBACK;
      if (c5.length < n * 2 + 1) return { available: false };

      const hi = c5.map((c) => c.high), lo = c5.map((c) => c.low);
      const sH = [], sL = [];
      for (let i = n; i < hi.length - n; i++) {
        if (hi[i] === Math.max(...hi.slice(i - n, i + n + 1))) sH.push({ i, v: hi[i] });
        if (lo[i] === Math.min(...lo.slice(i - n, i + n + 1))) sL.push({ i, v: lo[i] });
      }
      if (!sH.length || !sL.length) return { available: false };

      const sh = sH[sH.length - 1], sl = sL[sL.length - 1];
      const rng = sh.v - sl.v;
      if (rng <= 0) return { available: false };

      const res = { available: true, swing_high: r2(sh.v), swing_low: r2(sl.v), levels: {} };

      if (sh.i > sl.i) {
        res.direction = 'bullish';
        for (const f of C.OTE_FIBS) {
          const lv = r2(sh.v - rng * f);
          res.levels[String(f)] = { price: lv, near: near(price, lv) };
        }
        const top = r2(sh.v - rng * C.OTE_FIBS[0]);
        const bot = r2(sh.v - rng * C.OTE_FIBS[C.OTE_FIBS.length - 1]);
        res.in_ote = price >= bot && price <= top;
      } else {
        res.direction = 'bearish';
        for (const f of C.OTE_FIBS) {
          const lv = r2(sl.v + rng * f);
          res.levels[String(f)] = { price: lv, near: near(price, lv) };
        }
        const bot = r2(sl.v + rng * C.OTE_FIBS[0]);
        const top = r2(sl.v + rng * C.OTE_FIBS[C.OTE_FIBS.length - 1]);
        res.in_ote = price >= bot && price <= top;
      }
      return res;
    } catch { return { available: false }; }
  }

  // ── key opens ───────────────────────────────────────────────────
  _opens(intra, price, now) {
    if (!intra.length)
      return C.KEY_OPENS.map((k) => ({ label: k.label, price: null, near: false }));

    const today = now.startOf('day');
    return C.KEY_OPENS.map(({ label, hour, minute }) => {
      let op = null;
      if (hour === 18) {
        const matches = intra.filter((c) => { const t = toET(c.date); return t.hour === 18 && t.minute === 0 && t <= now; });
        if (matches.length) op = matches[matches.length - 1].open;
      } else if (hour === 0) {
        const matches = intra.filter((c) => { const t = toET(c.date); return t.hour === 0 && t.minute === 0 && t.hasSame(now, 'day'); });
        if (matches.length) op = matches[0].open;
      } else {
        const tgt = today.set({ hour, minute });
        if (now >= tgt) {
          const matches = intra.filter((c) => { const t = toET(c.date); return t >= tgt && t < tgt.plus({ minutes: 2 }); });
          if (matches.length) op = matches[0].open;
        }
      }
      op = r2(op);
      return { label, price: op, near: near(price, op) };
    });
  }

  // ── power of 3 ──────────────────────────────────────────────────
  _po3(intra, now) {
    if (!intra.length) return { available: false };
    const nyOpen = now.startOf('day').set({ hour: 9, minute: 30 });
    const nyD = intra.filter((c) => toET(c.date) >= nyOpen);
    if (!nyD.length) return { available: false };

    try {
      const open = r2(nyD[0].open);
      const high = r2(Math.max(...nyD.map((c) => c.high)));
      const low  = r2(Math.min(...nyD.map((c) => c.low)));
      const elapsed = now.diff(nyOpen, 'minutes').minutes;

      if (elapsed < 30)
        return { available: true, ny_open: open, high, low, phase: 'Accumulation', bias: 'Neutral' };

      const aEnd = nyOpen.plus({ minutes: 30 });
      const ac = nyD.filter((c) => toET(c.date) < aEnd);
      if (!ac.length)
        return { available: true, ny_open: open, high, low, phase: 'Accumulation', bias: 'Neutral' };

      const aH = Math.max(...ac.map((c) => c.high));
      const aL = Math.min(...ac.map((c) => c.low));
      const aR = aH !== aL ? aH - aL : 1;
      const buf = aR * 0.1;
      const sH = high > aH + buf, sL = low < aL - buf;
      const cur = nyD[nyD.length - 1].close;

      let phase, bias;
      if (sL && cur > open) { phase = 'Distribution'; bias = 'Bullish'; }
      else if (sH && cur < open) { phase = 'Distribution'; bias = 'Bearish'; }
      else if (sH) { phase = 'Manipulation'; bias = 'Bearish'; }
      else if (sL) { phase = 'Manipulation'; bias = 'Bullish'; }
      else { phase = 'Accumulation'; bias = 'Neutral'; }

      return { available: true, ny_open: open, high, low, phase, bias };
    } catch { return { available: false }; }
  }

  // ── resample to N-min candles ───────────────────────────────────
  _resample(candles, n) {
    const res = [];
    let bk = null, bs = null;
    const ms = n * 60000;
    for (const c of candles) {
      if (c.high == null || c.low == null) continue;
      const t = c.date.getTime();
      const s = Math.floor(t / ms) * ms;
      if (s !== bs) {
        if (bk) res.push(bk);
        bs = s;
        bk = { date: new Date(s), open: c.open, high: c.high, low: c.low, close: c.close };
      } else {
        bk.high = Math.max(bk.high, c.high);
        bk.low = Math.min(bk.low, c.low);
        bk.close = c.close;
      }
    }
    if (bk) res.push(bk);
    return res;
  }
}

module.exports = ICTEngine;
