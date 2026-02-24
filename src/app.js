/* ── ICT Dashboard — Renderer ──────────────────────────────────────── */

// ── formatting helpers ──────────────────────────────────────────────
const F = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cc = (v) => v > 0 ? 'c-up' : v < 0 ? 'c-dn' : 'c-n';
const cs = (v) => v > 0 ? '+' : '';
const dot = (s) => `<span class="dot ${s === 'ACTIVE' ? 'd-on' : s === 'upcoming' ? 'd-up' : 'd-off'}"></span>`;
const bg = (t, c) => `<span class="b ${c}">${t}</span>`;

// ── live clock ──────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  const et = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  document.getElementById('clock').textContent = et;
}
setInterval(tickClock, 1000);
tickClock();

// ── IPC listener ────────────────────────────────────────────────────
let firstUpdate = true;
window.dashboard.onUpdate((d) => {
  if (firstUpdate) {
    const el = document.getElementById('status');
    el.textContent = 'LIVE';
    el.className = 'hdr-status live';
    firstUpdate = false;
  }
  render(d);
});

// ── main render ─────────────────────────────────────────────────────
function render(d) {
  document.getElementById('clock').textContent = d.time || '';
  document.getElementById('date-d').textContent = d.date || '';

  const nq = d.tickers['NQ=F'], es = d.tickers['ES=F'];

  // header prices
  if (nq) {
    document.getElementById('nq-price').textContent = F(nq.price);
    const el = document.getElementById('nq-chg');
    el.textContent = `${cs(nq.daily_change)}${nq.daily_change}%`;
    el.className = `ticker-chg ${cc(nq.daily_change)}`;
  }
  if (es) {
    document.getElementById('es-price').textContent = F(es.price);
    const el = document.getElementById('es-chg');
    el.textContent = `${cs(es.daily_change)}${es.daily_change}%`;
    el.className = `ticker-chg ${cc(es.daily_change)}`;
  }

  rSession(d.kill_zones);
  rKZ(d.kill_zones);
  rMacros(d.macros);
  rLevels(nq, es);
  rLiq(nq, es);
  rOpens(nq, es);
  rOTE(nq, es);
  rPo3(nq, es);
}

// ── active session (header) ─────────────────────────────────────────
function rSession(zones) {
  const el = document.getElementById('active-session');
  const a = (zones || []).find(z => z.active);
  el.innerHTML = a
    ? `${bg('ACTIVE','b-act')} <span class="c-up" style="margin-left:4px">${a.name}</span>`
    : `<span class="c-n">No Active Session</span>`;
}

// ── kill zones ──────────────────────────────────────────────────────
function rKZ(zones) {
  const el = document.getElementById('p-kz');
  if (!zones?.length) { el.innerHTML = wait(); return; }
  el.innerHTML = zones.map(z => {
    const active = z.active ? ' row-active' : '';
    let r;
    if (z.active) r = `${bg('ACTIVE','b-act')} <span class="c-up" style="font-size:10px;margin-left:3px">${z.countdown}</span>`;
    else if (z.status === 'upcoming') r = `<span class="c-am" style="font-size:11px">${z.countdown}</span>`;
    else r = `<span class="c-n" style="font-size:10px">Closed</span>`;
    return `<div class="row${active}"><div class="gap-s">${dot(z.status)}<span style="font-size:12px;font-weight:500">${z.name}</span></div><div class="gap-s">${r}</div></div>`;
  }).join('');
}

// ── macros ───────────────────────────────────────────────────────────
function rMacros(macros) {
  const el = document.getElementById('p-mc');
  if (!macros?.length) { el.innerHTML = wait(); return; }
  el.innerHTML = macros.map(m => {
    const active = m.active ? ' row-active' : '';
    let r;
    if (m.active) r = `${bg('ACTIVE','b-act')} <span class="c-up" style="font-size:10px;margin-left:3px">${m.countdown}</span>`;
    else if (m.status === 'upcoming') r = `<span class="c-am" style="font-size:11px">${m.countdown}</span>`;
    else r = `<span class="c-n" style="font-size:10px">Closed</span>`;
    return `<div class="row${active}"><div class="gap-s">${dot(m.status)}<span style="font-size:12px;font-weight:500">${m.label}</span></div><div class="gap-s">${r}</div></div>`;
  }).join('');
}

// ── key levels ──────────────────────────────────────────────────────
const LK = [
  ['pdh','PDH','Previous Day High'],['pdl','PDL','Previous Day Low'],
  ['pdo','PDO','Previous Day Open'],['pdc','PDC','Previous Day Close'],
  ['pwh','PWH','Previous Week High'],['pwl','PWL','Previous Week Low'],
  ['pwo','PWO','Previous Week Open'],['pwc','PWC','Previous Week Close'],
];
function rLevels(nq, es) {
  const el = document.getElementById('p-lv');
  let h = `<div class="gh" style="grid-template-columns:1fr 1fr 1fr"><div></div><div class="tr">NQ</div><div class="tr">ES</div></div>`;
  for (const [k, lb, tip] of LK) {
    const nv = nq?.levels?.[k], ev = es?.levels?.[k];
    h += `<div class="gr" style="grid-template-columns:1fr 1fr 1fr">
      <div class="c-n med" style="font-size:12px;cursor:default" title="${tip}">${lb}</div>
      <div class="tr tab ${nv?.near?'c-am':''}">${F(nv?.value)}${nv?.near?' '+bg('NEAR','b-nr'):''}</div>
      <div class="tr tab ${ev?.near?'c-am':''}">${F(ev?.value)}${ev?.near?' '+bg('NEAR','b-nr'):''}</div>
    </div>`;
  }
  el.innerHTML = h;
}

// ── liquidity sweeps ────────────────────────────────────────────────
function rLiq(nq, es) {
  const el = document.getElementById('p-lq');
  const nL = nq?.liquidity||[], eL = es?.liquidity||[];
  const labs = [...new Set([...nL.map(l=>l.label),...eL.map(l=>l.label)])];
  if (!labs.length) { el.innerHTML = wait(); return; }

  let h = `<div class="gh" style="grid-template-columns:1.3fr 1fr .6fr 1fr .6fr"><div></div><div class="tr">NQ</div><div class="tc">Status</div><div class="tr">ES</div><div class="tc">Status</div></div>`;
  for (const lb of labs) {
    const ni = nL.find(l=>l.label===lb), ei = eL.find(l=>l.label===lb);
    h += `<div class="gr" style="grid-template-columns:1.3fr 1fr .6fr 1fr .6fr">
      <div class="c-n med" style="font-size:12px">${lb}</div>
      <div class="tr tab">${F(ni?.level)}</div><div class="tc">${sw(ni)}</div>
      <div class="tr tab">${F(ei?.level)}</div><div class="tc">${sw(ei)}</div>
    </div>`;
  }
  el.innerHTML = h;
}
function sw(i) {
  if (!i || i.status==='N/A') return `<span class="c-n" style="font-size:10px">N/A</span>`;
  return i.swept ? bg('SWEPT','b-swp') : bg('Unswept','b-un');
}

// ── key opens (sidebar compact) ─────────────────────────────────────
function rOpens(nq, es) {
  const el = document.getElementById('p-ko');
  const nO = nq?.key_opens||[], eO = es?.key_opens||[];
  const len = Math.max(nO.length, eO.length);
  if (!len) { el.innerHTML = wait(); return; }

  let h = '';
  for (let i = 0; i < len; i++) {
    const n = nO[i], e = eO[i], lb = n?.label||e?.label||'';
    const nNear = n?.near ? ' c-am' : '';
    const eNear = e?.near ? ' c-am' : '';
    h += `<div class="row">
      <span style="font-size:11px;font-weight:600;color:var(--text2);min-width:48px">${lb}</span>
      <div style="display:flex;gap:12px;font-size:11px">
        <span class="tab${nNear}" title="NQ">${F(n?.price)}</span>
        <span class="tab${eNear}" title="ES">${F(e?.price)}</span>
      </div>
    </div>`;
  }
  el.innerHTML = h;
}

// ── OTE ─────────────────────────────────────────────────────────────
function rOTE(nq, es) {
  const el = document.getElementById('p-ot');
  let h = '';
  for (const t of [nq, es]) {
    if (!t) continue;
    const o = t.ote;
    if (!o?.available) {
      h += `<div class="ote-ticker"><div class="ote-header"><span class="label">${t.label}</span><span class="c-n" style="font-size:11px">No swing detected</span></div></div>`;
      continue;
    }
    const dc = o.direction === 'bullish' ? 'c-up' : 'c-dn';
    const ar = o.direction === 'bullish' ? '↑ Long' : '↓ Short';
    h += `<div class="ote-ticker">
      <div class="ote-header">
        <span class="label">${t.label}</span>
        <span class="swing">${F(o.swing_low)} → ${F(o.swing_high)}</span>
        <span class="dir ${dc}">${ar}</span>
        ${o.in_ote ? bg('IN OTE','b-ote') : ''}
      </div>
      <div class="fib-grid">`;
    for (const [fib, fd] of Object.entries(o.levels)) {
      h += `<div class="fib-chip${fd.near ? ' near' : ''}">
        <div class="fib-label">${fib}</div>
        <div class="fib-val ${fd.near ? 'c-am' : ''}">${F(fd.price)}</div>
      </div>`;
    }
    h += `</div></div>`;
  }
  el.innerHTML = h || wait();
}

// ── power of 3 ──────────────────────────────────────────────────────
function rPo3(nq, es) {
  const el = document.getElementById('p-p3');
  if (!nq?.po3?.available && !es?.po3?.available) {
    el.innerHTML = `<span class="c-n" style="font-size:12px">NY session not active or no data</span>`;
    return;
  }

  let h = `<div class="po3-wrap">`;
  for (const t of [nq, es]) {
    if (!t) continue;
    const p = t.po3;
    if (!p?.available) {
      h += `<div class="po3-col"><div class="po3-title">${t.label}</div><span class="c-n" style="font-size:11px">N/A</span></div>`;
      continue;
    }
    const pc = p.phase==='Accumulation'?'ph-a':p.phase==='Manipulation'?'ph-m':'ph-d';
    const bc = p.bias==='Bullish'?'bi-b':p.bias==='Bearish'?'bi-br':'bi-n';
    h += `<div class="po3-col">
      <div class="po3-title">${t.label}</div>
      <div class="po3-row"><span class="k">NY Open</span><span class="v">${F(p.ny_open)}</span></div>
      <div class="po3-row"><span class="k">Session High</span><span class="v">${F(p.high)}</span></div>
      <div class="po3-row"><span class="k">Session Low</span><span class="v">${F(p.low)}</span></div>
      <div class="po3-divider"></div>
      <div class="po3-row"><span class="k">Phase</span><span class="v bld ${pc}">${p.phase}</span></div>
      <div class="po3-row"><span class="k">Bias</span><span class="v bld ${bc}">${p.bias}</span></div>
    </div>`;
  }
  h += `</div>`;
  el.innerHTML = h;
}

function wait() { return `<span class="c-n" style="font-size:11px">Waiting for data…</span>`; }
