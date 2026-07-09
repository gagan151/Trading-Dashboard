import { fmtPrice, levelLabel } from '../lib/format'
import type { LevelInfo, Tick } from '../lib/types'

interface Props {
  label: string
  name: string
  tick: Tick | null
  levels: LevelInfo[]
}

type Status = 'target' | 'swept' | 'forming'

function levelStatus(l: LevelInfo): Status {
  if (!l.present) return 'forming'
  if (l.swept) return 'swept'
  if (l.locked) return 'target'
  return 'forming'
}

const STATUS: Record<Status, { color: string; line: string; text: string; icon: string }> = {
  // Live, unswept, locked level — the target price is drawn to.
  target: { color: '#f59e0b', line: 'solid', text: 'text-amber', icon: '●' },
  // Already taken out — faded, no longer a live draw.
  swept: { color: '#7d8a9c', line: 'dashed', text: 'text-muted', icon: '✓' },
  // Session still forming (Asia/London mid-session) — not yet sweepable.
  forming: { color: '#46506a', line: 'dashed', text: 'text-muted/70', icon: '◐' },
}

function sessionLabel(mh: number | undefined): string {
  if (mh == null) return '—'
  if (mh === 0) return 'REG'
  if (mh === 1) return 'PRE'
  if (mh === 2) return 'POST'
  return '—'
}

export function LiquidityLadder({ label, name, tick, levels }: Props) {
  const last = tick?.price
  const lastFinite = Number.isFinite(last) ? (last as number) : null

  // Present levels (finite value), sorted high -> low for top-to-bottom rendering.
  const present = levels.filter((l) => l.present && Number.isFinite(l.value))
  const sorted = [...present].sort((a, b) => b.value - a.value)

  // Price range across all present levels + live price, with padding so markers
  // never clip at the edges. Drives the vertical (to-scale) positioning.
  const vals = present.map((l) => l.value)
  if (lastFinite != null) vals.push(lastFinite)
  let max = NaN
  let min = NaN
  if (vals.length > 0) {
    max = Math.max(...vals)
    min = Math.min(...vals)
    const span = max - min || 1
    const pad = span * 0.1
    max += pad
    min -= pad
  }
  const yPct = (v: number) => ((max - v) / (max - min)) * 100
  const hasRange = Number.isFinite(max) && Number.isFinite(min) && max > min

  const up = (tick?.change ?? 0) >= 0
  const change = tick?.change
  const pct = tick?.change_percent
  const changeStr =
    change != null && pct != null && Number.isFinite(change)
      ? `${up ? '+' : ''}${fmtPrice(change)} (${up ? '+' : ''}${fmtPrice(pct)}%)`
      : '—'

  const spanPts =
    present.length >= 2 ? fmtPrice(Math.max(...present.map((l) => l.value)) - Math.min(...present.map((l) => l.value))) : '—'

  return (
    <section className="bg-panel border border-border rounded-lg flex flex-col min-h-0 overflow-hidden">
      {/* Header: symbol + live price + change + day H/L (folds in the old price card) */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-baseline justify-between">
          <div className="min-w-0">
            <span className="text-base font-semibold text-fg">{label}</span>
            <span className="text-[11px] text-muted ml-2 truncate">{name}</span>
          </div>
          <div className="text-right">
            <div className={`text-lg font-mono ${lastFinite != null ? (up ? 'text-up' : 'text-down') : 'text-fg'}`}>
              {lastFinite != null ? fmtPrice(lastFinite) : '—'}
            </div>
            <div className={`text-xs font-mono ${up ? 'text-up' : 'text-down'}`}>{changeStr}</div>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-muted">
          <span>
            H {fmtPrice(tick?.day_high ?? NaN)} · L {fmtPrice(tick?.day_low ?? NaN)}
          </span>
          <span>
            {sessionLabel(tick?.market_hours)} · range {spanPts}
          </span>
        </div>
      </div>

      {/* Ladder body: levels + live price positioned to scale by price */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {sorted.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
            Levels forming…
          </div>
        )}

        {hasRange &&
          sorted.map((l) => {
            const st = STATUS[levelStatus(l)]
            const dist =
              lastFinite != null ? `${l.value > lastFinite ? '↑' : '↓'} ${fmtPrice(Math.abs(l.value - lastFinite))}` : '—'
            return (
              <div
                key={`${l.kind}-${l.side}`}
                className="absolute left-0 right-0 flex items-center gap-2 px-2"
                style={{ top: `${yPct(l.value)}%`, transform: 'translateY(-50%)' }}
              >
                <span className={`text-[11px] font-mono whitespace-nowrap ${st.text}`}>
                  <span aria-hidden>{st.icon}</span> {levelLabel(l.kind, l.side)}{' '}
                  <span className="opacity-80">{fmtPrice(l.value)}</span>
                </span>
                <div className="flex-1" style={{ borderTop: `1px ${st.line} ${st.color}` }} />
                <span className={`text-[11px] font-mono whitespace-nowrap ${st.text}`}>{dist}</span>
              </div>
            )
          })}

        {hasRange && lastFinite != null && (
          <div
            className="absolute left-0 right-0 flex items-center gap-2 px-2 z-10"
            style={{ top: `${yPct(lastFinite)}%`, transform: 'translateY(-50%)' }}
          >
            <span className="text-[10px] font-mono uppercase tracking-wider text-accent">live</span>
            <div className="flex-1" style={{ borderTop: '2px solid #3b82f6' }} />
            <span className="text-[11px] font-mono font-semibold text-bg bg-accent px-1.5 py-0.5 rounded">
              {fmtPrice(lastFinite)}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
