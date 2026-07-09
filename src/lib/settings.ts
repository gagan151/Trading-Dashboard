import { SYMBOLS } from './symbols'

export interface Settings {
  notifications: boolean
  symbols: Record<string, boolean>
}

const KEY = 'td-settings'

export const defaultSettings = (): Settings => ({
  notifications: true,
  symbols: Object.fromEntries(SYMBOLS.map((s) => [s, true])),
})

export function loadSettings(): Settings {
  const base = defaultSettings()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      notifications: parsed.notifications ?? base.notifications,
      symbols: { ...base.symbols, ...(parsed.symbols ?? {}) },
    }
  } catch {
    return base
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore quota / private-mode errors */
  }
}
