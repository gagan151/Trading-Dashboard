/* ── ICT Dashboard — Frontend ── */

const RECONNECT_MS = 5000;
let ws = null;
let reconnTimer = null;

// ═══════════════════════════════════════════════════════════════════
//  WebSocket
// ═══════════════════════════════════════════════════════════════════
function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    setConn("LIVE", "conn-live");
    if (reconnTimer) { clearTimeout(reconnTimer); reconnTimer = null; }
  };

  ws.onmessage = (e) => {
    try { render(JSON.parse(e.data)); }
    catch (err) { console.error("parse error", err); }
  };

  ws.onclose = () => {
    setConn("RECONNECTING", "conn-disconnected");
    reconnTimer = setTimeout(connect, RECONNECT_MS);
  };

  ws.onerror = () => ws.close();
}

function setConn(text, cls) {
  const el = document.getElementById("connection-status");
  el.textContent = text;
  el.className = `text-xs font-bold tracking-wider uppercase ${cls}`;
}

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════
function fmt(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function chgClass(v) { return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-gray-500"; }
function chgSign(v)  { return v > 0 ? "+" : ""; }

function dotHtml(status) {
  const cls = status === "ACTIVE" ? "dot-active" : status === "upcoming" ? "dot-upcoming" : "dot-closed";
  return `<span class="dot ${cls}"></span>`;
}

function badgeHtml(text, cls) {
  return `<span class="badge ${cls}">${text}</span>`;
}

// ═══════════════════════════════════════════════════════════════════
//  Main render
// ═══════════════════════════════════════════════════════════════════
function render(d) {
  // clock
  document.getElementById("clock").textContent = d.time || "";
  document.getElementById("date-display").textContent = d.date || "";

  const nq = d.tickers["NQ=F"];
  const es = d.tickers["ES=F"];

  // prices
  if (nq) {
    document.getElementById("nq-price").textContent = fmt(nq.price);
    const c = document.getElementById("nq-change");
    c.textContent = `${chgSign(nq.daily_change)}${nq.daily_change}%`;
    c.className = `text-sm font-semibold tabular-nums ${chgClass(nq.daily_change)}`;
  }
  if (es) {
    document.getElementById("es-price").textContent = fmt(es.price);
    const c = document.getElementById("es-change");
    c.textContent = `${chgSign(es.daily_change)}${es.daily_change}%`;
    c.className = `text-sm font-semibold tabular-nums ${chgClass(es.daily_change)}`;
  }

  renderActiveSession(d.kill_zones);
  renderKillZones(d.kill_zones);
  renderMacros(d.macros);
  renderLevels(nq, es);
  renderLiquidity(nq, es);
  renderKeyOpens(nq, es);
  renderOTE(nq, es);
  renderPo3(nq, es);
}

// ═══════════════════════════════════════════════════════════════════
//  Active session badge (top bar)
// ═══════════════════════════════════════════════════════════════════
function renderActiveSession(zones) {
  const el = document.getElementById("active-session");
  const active = (zones || []).find(z => z.active);
  if (active) {
    el.innerHTML = `${badgeHtml("ACTIVE", "badge-active")} <span class="text-emerald-400 ml-1">${active.name} Kill Zone</span>`;
  } else {
    el.innerHTML = `<span class="text-gray-600">No Active Session</span>`;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Kill Zones
// ═══════════════════════════════════════════════════════════════════
function renderKillZones(zones) {
  const el = document.getElementById("kill-zones");
  if (!zones || !zones.length) { el.innerHTML = noData(); return; }
  el.innerHTML = zones.map(z => {
    let right;
    if (z.active) {
      right = `${badgeHtml("ACTIVE", "badge-active")} <span class="text-emerald-400 text-xs ml-1">${z.countdown} left</span>`;
    } else if (z.status === "upcoming") {
      right = `<span class="text-amber-400 text-sm">${z.countdown}</span>`;
    } else {
      right = `<span class="text-gray-600 text-xs">Closed</span>`;
    }
    return `<div class="row">
      <div class="flex items-center gap-3">${dotHtml(z.status)}<span class="text-sm font-medium">${z.name}</span></div>
      <div class="flex items-center gap-2">${right}</div>
    </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════
//  ICT Macros
// ═══════════════════════════════════════════════════════════════════
function renderMacros(macros) {
  const el = document.getElementById("macros");
  if (!macros || !macros.length) { el.innerHTML = noData(); return; }
  el.innerHTML = macros.map(m => {
    let right;
    if (m.active) {
      right = `${badgeHtml("MACRO ACTIVE", "badge-active")} <span class="text-emerald-400 text-xs ml-1">${m.countdown}</span>`;
    } else if (m.status === "upcoming") {
      right = `<span class="text-amber-400 text-sm">${m.countdown}</span>`;
    } else {
      right = `<span class="text-gray-600 text-xs">Closed</span>`;
    }
    return `<div class="row">
      <div class="flex items-center gap-3">${dotHtml(m.status)}<span class="text-sm font-medium">${m.label}</span></div>
      <div class="flex items-center gap-2">${right}</div>
    </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════
//  Key Levels
// ═══════════════════════════════════════════════════════════════════
const LEVEL_KEYS = [
  { key: "pdh", label: "PDH" }, { key: "pdl", label: "PDL" },
  { key: "pdo", label: "PDO" }, { key: "pdc", label: "PDC" },
  { key: "pwh", label: "PWH" }, { key: "pwl", label: "PWL" },
  { key: "pwo", label: "PWO" }, { key: "pwc", label: "PWC" },
];

function renderLevels(nq, es) {
  const el = document.getElementById("key-levels");
  let h = `<div class="grid-header" style="grid-template-columns:1fr 1fr 1fr">
    <div></div><div class="text-right">NQ</div><div class="text-right">ES</div>
  </div>`;
  for (const { key, label } of LEVEL_KEYS) {
    const nv = nq?.levels?.[key], ev = es?.levels?.[key];
    h += `<div class="grid-row" style="grid-template-columns:1fr 1fr 1fr">
      <div class="text-gray-500 font-medium">${label}</div>
      <div class="text-right ${nv?.near ? "text-amber-400 font-bold" : ""}">${fmt(nv?.value)} ${nv?.near ? badgeHtml("NEAR", "badge-near") : ""}</div>
      <div class="text-right ${ev?.near ? "text-amber-400 font-bold" : ""}">${fmt(ev?.value)} ${ev?.near ? badgeHtml("NEAR", "badge-near") : ""}</div>
    </div>`;
  }
  el.innerHTML = h;
}

// ═══════════════════════════════════════════════════════════════════
//  Liquidity Sweeps
// ═══════════════════════════════════════════════════════════════════
function renderLiquidity(nq, es) {
  const el = document.getElementById("liquidity");
  const nqL = nq?.liquidity || [], esL = es?.liquidity || [];
  const labels = [...new Set([...nqL.map(l => l.label), ...esL.map(l => l.label)])];
  if (!labels.length) { el.innerHTML = noData(); return; }

  let h = `<div class="grid-header" style="grid-template-columns:1.2fr 1fr 0.7fr 1fr 0.7fr">
    <div></div><div class="text-right">NQ</div><div class="text-center">Status</div><div class="text-right">ES</div><div class="text-center">Status</div>
  </div>`;

  for (const label of labels) {
    const ni = nqL.find(l => l.label === label);
    const ei = esL.find(l => l.label === label);
    h += `<div class="grid-row" style="grid-template-columns:1.2fr 1fr 0.7fr 1fr 0.7fr">
      <div class="text-gray-500 font-medium">${label}</div>
      <div class="text-right">${fmt(ni?.level)}</div>
      <div class="text-center">${sweepBadge(ni)}</div>
      <div class="text-right">${fmt(ei?.level)}</div>
      <div class="text-center">${sweepBadge(ei)}</div>
    </div>`;
  }
  el.innerHTML = h;
}

function sweepBadge(item) {
  if (!item || item.status === "N/A") return `<span class="text-gray-600 text-xs">N/A</span>`;
  return item.swept ? badgeHtml("SWEPT", "badge-swept") : badgeHtml("Unswept", "badge-unswept");
}

// ═══════════════════════════════════════════════════════════════════
//  Key Opens
// ═══════════════════════════════════════════════════════════════════
function renderKeyOpens(nq, es) {
  const el = document.getElementById("key-opens");
  const nqO = nq?.key_opens || [], esO = es?.key_opens || [];
  const len = Math.max(nqO.length, esO.length);
  if (!len) { el.innerHTML = noData(); return; }

  let h = `<div class="grid-header" style="grid-template-columns:1.4fr 1fr 1fr">
    <div></div><div class="text-right">NQ</div><div class="text-right">ES</div>
  </div>`;
  for (let i = 0; i < len; i++) {
    const n = nqO[i], e = esO[i];
    const label = n?.label || e?.label || "";
    h += `<div class="grid-row" style="grid-template-columns:1.4fr 1fr 1fr">
      <div class="text-gray-500 font-medium">${label}</div>
      <div class="text-right ${n?.near ? "text-amber-400 font-bold" : ""}">${fmt(n?.price)} ${n?.near ? badgeHtml("NEAR", "badge-near") : ""}</div>
      <div class="text-right ${e?.near ? "text-amber-400 font-bold" : ""}">${fmt(e?.price)} ${e?.near ? badgeHtml("NEAR", "badge-near") : ""}</div>
    </div>`;
  }
  el.innerHTML = h;
}

// ═══════════════════════════════════════════════════════════════════
//  OTE
// ═══════════════════════════════════════════════════════════════════
function renderOTE(nq, es) {
  const el = document.getElementById("ote");
  let h = "";
  for (const t of [nq, es]) {
    if (!t) continue;
    const o = t.ote;
    if (!o?.available) {
      h += `<div class="mb-3"><span class="text-sm font-bold text-gray-400">${t.label}</span><span class="text-gray-600 text-xs ml-3">No swing detected</span></div>`;
      continue;
    }
    const dirCls = o.direction === "bullish" ? "text-emerald-400" : "text-red-400";
    const arrow  = o.direction === "bullish" ? "↑ Long" : "↓ Short";
    h += `<div class="mb-5">
      <div class="flex items-center gap-3 mb-2">
        <span class="text-sm font-bold">${t.label}</span>
        <span class="text-xs text-gray-500">${fmt(o.swing_low)} → ${fmt(o.swing_high)}</span>
        <span class="text-xs ${dirCls} font-semibold">${arrow}</span>
        ${o.in_ote ? badgeHtml("IN OTE ZONE", "badge-in-ote") : ""}
      </div>
      <div class="grid grid-cols-3 gap-2">`;

    for (const [fib, fd] of Object.entries(o.levels)) {
      const ring = fd.near ? "ring-1 ring-amber-500/60" : "";
      h += `<div class="bg-[#1a1a2a] rounded-lg px-3 py-2 text-center ${ring}">
        <div class="text-[10px] text-gray-500 font-semibold">${fib}</div>
        <div class="text-sm font-medium tabular-nums ${fd.near ? "text-amber-400" : ""}">${fmt(fd.price)}</div>
      </div>`;
    }
    h += `</div></div>`;
  }
  el.innerHTML = h || noData();
}

// ═══════════════════════════════════════════════════════════════════
//  Power of 3
// ═══════════════════════════════════════════════════════════════════
function renderPo3(nq, es) {
  const el = document.getElementById("po3");
  if (!nq?.po3?.available && !es?.po3?.available) {
    el.innerHTML = `<div class="text-gray-600 text-sm">NY session not active or no data</div>`;
    return;
  }

  let h = `<div class="grid grid-cols-1 md:grid-cols-2 gap-6">`;
  for (const t of [nq, es]) {
    if (!t) continue;
    const p = t.po3;
    if (!p?.available) {
      h += `<div><span class="text-sm font-bold text-gray-400">${t.label}</span><span class="text-gray-600 text-xs ml-3">Not available</span></div>`;
      continue;
    }

    const phaseCls = p.phase === "Accumulation" ? "phase-accum" : p.phase === "Manipulation" ? "phase-manip" : "phase-dist";
    const biasCls  = p.bias === "Bullish" ? "bias-bull" : p.bias === "Bearish" ? "bias-bear" : "bias-neutral";

    h += `<div>
      <div class="text-sm font-bold mb-3">${t.label}</div>
      <div class="space-y-1.5">
        ${po3Row("NY Open", fmt(p.ny_open))}
        ${po3Row("Session High", fmt(p.high))}
        ${po3Row("Session Low", fmt(p.low))}
        <div class="border-t border-[#222233] my-1"></div>
        ${po3Row("Phase", `<span class="font-bold ${phaseCls}">${p.phase}</span>`)}
        ${po3Row("Bias", `<span class="font-bold ${biasCls}">${p.bias}</span>`)}
      </div>
    </div>`;
  }
  h += `</div>`;
  el.innerHTML = h;
}

function po3Row(label, value) {
  return `<div class="flex justify-between text-sm"><span class="text-gray-500">${label}</span><span class="tabular-nums">${value}</span></div>`;
}

// ═══════════════════════════════════════════════════════════════════
function noData() { return `<div class="text-gray-600 text-xs">Waiting for data…</div>`; }

// ── start ──
connect();
