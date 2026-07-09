import { SYMBOL_INFO } from '../lib/symbols'
import type { Settings } from '../lib/settings'

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between py-1.5 cursor-pointer">
      <span>
        <span className="text-sm text-fg">{label}</span>
        {description && (
          <span className="block text-[11px] text-muted">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-fg transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  )
}

interface Props {
  settings: Settings
  onChange: (next: Settings) => void
  onClose: () => void
}

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch })
  const setSymbol = (sym: string, v: boolean) =>
    onChange({ ...settings, symbols: { ...settings.symbols, [sym]: v } })

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end p-2 bg-black/40"
      onClick={onClose}
    >
      <section
        className="mt-12 w-72 bg-panel border border-border rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold tracking-wider text-muted uppercase">
            Settings
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg text-sm"
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>
        <div className="px-3 py-2 flex flex-col gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
              Alerts
            </div>
            <Toggle
              label="Sweep notifications"
              description="Native OS alert on Asia/London/PD/PW sweeps"
              checked={settings.notifications}
              onChange={(v) => set({ notifications: v })}
            />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
              Symbols
            </div>
            {Object.keys(settings.symbols).map((sym) => (
              <Toggle
                key={sym}
                label={`${SYMBOL_INFO[sym]?.label ?? sym} — ${SYMBOL_INFO[sym]?.name ?? ''}`}
                checked={settings.symbols[sym]}
                onChange={(v) => setSymbol(sym, v)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
