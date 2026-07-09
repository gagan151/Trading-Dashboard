import { useMemo } from 'react'

import { fmtETSec, fmtPrice, levelLabel } from '../lib/format'
import type { IctState } from '../lib/types'
import { Panel } from './Panel'

interface SweepEntry {
  symbol: string
  kind: string
  side: string
  value: number
  swept_at: number
}

export function SweepLogPanel({ ict }: { ict: IctState | null }) {
  const entries = useMemo<SweepEntry[]>(() => {
    if (!ict) return []
    const out: SweepEntry[] = []
    for (const [sym, s] of Object.entries(ict.symbols)) {
      for (const l of s.levels) {
        if (l.swept && l.swept_at && l.present) {
          out.push({ symbol: sym, kind: l.kind, side: l.side, value: l.value, swept_at: l.swept_at })
        }
      }
    }
    return out.sort((a, b) => b.swept_at - a.swept_at).slice(0, 12)
  }, [ict])

  return (
    <Panel title="Sweep Log">
      {entries.length ? (
        <div className="flex flex-col gap-1">
          {entries.map((e, i) => (
            <div
              key={`${e.symbol}-${e.kind}-${e.side}-${i}`}
              className="flex items-center justify-between text-xs py-1 border-b border-border/60 last:border-0"
            >
              <span className="text-fg truncate">
                <span className="text-muted mr-1">{e.symbol}</span>
                {levelLabel(e.kind, e.side)}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-muted">{fmtPrice(e.value)}</span>
                <span className="font-mono text-[10px] text-down">{fmtETSec(e.swept_at)}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted">No sweeps yet this session.</div>
      )}
    </Panel>
  )
}
