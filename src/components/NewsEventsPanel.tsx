import { fmtET } from '../lib/format'
import { openExternal } from '../lib/tauri'
import type { EconEvent, NewsItem } from '../lib/types'
import { Panel } from './Panel'
import { Pill, type Tone } from './Pill'

function fmtAgo(ts: number, nowSec: number): string {
  if (!ts) return ''
  const diff = Math.max(0, nowSec - ts)
  const m = Math.floor(diff / 60)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function impactTone(impact: string): Tone {
  if (impact === 'high') return 'down'
  if (impact === 'medium') return 'amber'
  return 'neutral'
}

function impactLabel(impact: string): string {
  if (impact === 'high') return 'High'
  if (impact === 'medium') return 'Med'
  if (impact === 'low') return 'Low'
  return '—'
}

interface Props {
  news: NewsItem[]
  events: EconEvent[]
  providerLabel: string
}

export function NewsEventsPanel({ news, events, providerLabel }: Props) {
  const nowSec = Math.floor(Date.now() / 1000)

  return (
    <Panel title="News · Events">
      <div className="flex flex-col gap-3">
        {/* Economic calendar */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Economic Calendar
          </div>
          {events.length ? (
            <div className="flex flex-col gap-1">
              {events.slice(0, 12).map((e, i) => (
                <div
                  key={`${e.event}-${i}`}
                  className="flex items-start gap-2 text-xs py-1 border-b border-border/60 last:border-0"
                >
                  <Pill tone={impactTone(e.impact)}>{impactLabel(e.impact)}</Pill>
                  <div className="min-w-0 flex-1">
                    <div className="text-fg truncate">
                      {e.country && (
                        <span className="text-muted mr-1">{e.country}:</span>
                      )}
                      {e.event}
                    </div>
                    <div className="text-[10px] font-mono text-muted flex gap-2">
                      <span>{e.time ? fmtET(e.time) : 'All day'}</span>
                      {(e.actual || e.forecast || e.previous) && (
                        <span>
                          {e.actual && `A:${e.actual} `}
                          {e.forecast && `F:${e.forecast} `}
                          {e.previous && `P:${e.previous}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted">
              {providerLabel === 'none'
                ? 'No calendar source. Set FINNHUB_API_KEY to enable.'
                : 'No events today.'}
            </div>
          )}
        </div>

        {/* Headlines */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
            Headlines
          </div>
          {news.length ? (
            <div className="flex flex-col gap-1">
              {news.slice(0, 20).map((n, i) => (
                <button
                  type="button"
                  key={`${n.link}-${i}`}
                  onClick={() => openExternal(n.link).catch(() => {})}
                  className="block w-full text-left text-xs py-1 border-b border-border/60 last:border-0 hover:bg-panel-2/60 rounded px-1 -mx-1 cursor-pointer"
                  title={n.link}
                >
                  <div className="text-fg leading-snug">{n.title}</div>
                  <div className="text-[10px] font-mono text-muted flex justify-between">
                    <span>{n.publisher}</span>
                    <span>{fmtAgo(n.time, nowSec)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted">Loading headlines…</div>
          )}
        </div>
      </div>
    </Panel>
  )
}
