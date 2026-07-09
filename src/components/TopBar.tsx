import { useNyClock } from '../lib/clock'
import { getMarketStatus } from '../lib/marketStatus'
import type { ConnectionStatus } from '../lib/types'
import { Pill, type Tone } from './Pill'

function connView(conn: ConnectionStatus | null): { tone: Tone; label: string } {
  switch (conn?.status) {
    case 'connected':
      return { tone: 'up', label: '● Live' }
    case 'polling':
      return { tone: 'amber', label: '● Polling' }
    case 'reconnecting':
      return { tone: 'amber', label: '● Reconnect' }
    case 'error':
      return { tone: 'down', label: '● Error' }
    default:
      return { tone: 'neutral', label: '● …' }
  }
}

export function TopBar({
  conn,
  activeSession = null,
  onOpenSettings = () => {},
}: {
  conn: ConnectionStatus | null
  activeSession: string | null
  onOpenSettings?: () => void
}) {
  const ny = useNyClock()
  const ms = getMarketStatus()
  const cv = connView(conn)

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-panel">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-wide">Trading Dashboard</span>
        <Pill tone="neutral">NQ · ES</Pill>
        {activeSession && activeSession !== 'Dead Zone' && (
          <Pill tone="amber">{activeSession}</Pill>
        )}
        <span className="text-[10px] text-muted/70 hidden sm:inline">
          Charts by TradingView
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Pill tone={ms.open ? 'up' : 'down'}>{ms.label}</Pill>
        {ms.cashOpen && <Pill tone="amber">Cash Open</Pill>}
        <span className="text-xs font-mono text-muted">NY {ny}</span>
        <Pill tone={cv.tone}>{cv.label}</Pill>
        <button
          type="button"
          onClick={onOpenSettings}
          className="text-muted hover:text-fg text-sm leading-none px-1"
          aria-label="Open settings"
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </header>
  )
}
