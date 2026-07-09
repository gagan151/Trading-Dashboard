import { useState } from 'react'
import { LiquidityLadder } from './components/LiquidityLadder'
import { NewsEventsPanel } from './components/NewsEventsPanel'
import { SessionMacroPanel } from './components/SessionMacroPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SweepLogPanel } from './components/SweepLogPanel'
import { TopBar } from './components/TopBar'
import { useIct } from './hooks/useIct'
import { useNewsEvents } from './hooks/useNewsEvents'
import { useSettings } from './hooks/useSettings'
import { useStream } from './hooks/useStream'
import { SYMBOLS, SYMBOL_INFO } from './lib/symbols'

export default function App() {
  const { ticks, conn } = useStream(SYMBOLS)
  const ict = useIct()
  const { news, events, providerLabel } = useNewsEvents()
  const { settings, update } = useSettings()
  const [showSettings, setShowSettings] = useState(false)

  const visibleSymbols = SYMBOLS.filter((s) => settings.symbols[s] !== false)

  return (
    <div className="h-full flex flex-col bg-bg text-fg">
      <TopBar
        conn={conn}
        activeSession={ict?.active_session ?? null}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="flex-1 grid grid-cols-[1fr_340px] gap-2 p-2 min-h-0">
        {/* Center: big liquidity ladders (replaces the candlestick charts) */}
        <div
          className={`grid gap-2 min-h-0 ${visibleSymbols.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
        >
          {visibleSymbols.map((sym) => (
            <LiquidityLadder
              key={sym}
              label={SYMBOL_INFO[sym].label}
              name={SYMBOL_INFO[sym].name}
              tick={ticks[sym] ?? null}
              levels={ict?.symbols[sym]?.levels ?? []}
            />
          ))}
        </div>

        {/* Right: session/macros + sweep log + news */}
        <div className="flex flex-col gap-2 min-h-0">
          <SessionMacroPanel ict={ict} />
          <SweepLogPanel ict={ict} />
          <NewsEventsPanel
            news={news}
            events={events}
            providerLabel={providerLabel}
          />
        </div>
      </main>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={update}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
