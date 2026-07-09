import { fmtCountdown, fmtET } from '../lib/format'
import type { IctState, MacroInfo } from '../lib/types'
import { Panel } from './Panel'
import { Pill, type Tone } from './Pill'

function macroTone(status: string): Tone {
  if (status === 'active') return 'amber'
  if (status === 'done') return 'neutral'
  return 'up'
}

export function SessionMacroPanel({ ict }: { ict: IctState | null }) {
  const active = ict?.active_session ?? '—'
  const next = ict?.next_macro ?? null
  const macros = ict?.today_macros ?? []
  const killzones = ict?.today_killzones ?? []

  return (
    <Panel title="Session · Macros">
      <div className="flex flex-col gap-3">
        {/* Active session + ET clock */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Active Session</div>
            <div className="text-base font-semibold text-fg">{active}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted">NY Time</div>
            <div className="text-base font-mono text-fg">{ict?.et_time ?? '--:--:--'}</div>
            <div className="text-[10px] font-mono text-muted">{ict?.et_date ?? ''}</div>
          </div>
        </div>

        {/* Next macro countdown */}
        <div className="bg-panel-2 border border-border rounded-md px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">Next Macro</div>
          {next ? (
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-fg">{next.label}</span>
              <span className="text-lg font-mono text-amber">{fmtCountdown(next.seconds_until)}</span>
            </div>
          ) : (
            <div className="text-sm text-muted">—</div>
          )}
        </div>

        {/* Kill zones */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Kill Zones</div>
          <div className="flex flex-col gap-1">
            {killzones.map((kz) => (
              <div
                key={kz.name}
                className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                  kz.active ? 'bg-accent/15 text-fg' : 'text-muted'
                }`}
              >
                <span>{kz.name}</span>
                <span className="font-mono">
                  {fmtET(kz.start)}–{fmtET(kz.end)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Macros */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Today's Macros</div>
          <div className="flex flex-col gap-1">
            {macros.map((m: MacroInfo) => (
              <div
                key={m.label}
                className={`flex items-center justify-between text-xs px-2 py-1 rounded ${
                  m.status === 'active' ? 'bg-amber/10' : ''
                }`}
              >
                <span className={m.status === 'done' ? 'text-muted line-through' : 'text-fg'}>
                  {m.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted">
                    {fmtET(m.start)}–{fmtET(m.end)}
                  </span>
                  <Pill tone={macroTone(m.status)}>{m.status}</Pill>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}
