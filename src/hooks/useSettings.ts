import { useCallback, useEffect, useState } from 'react'

import { loadSettings, saveSettings, type Settings } from '../lib/settings'
import { setNotificationsEnabled } from '../lib/tauri'

/**
 * User settings (notifications, chart overlays, symbol visibility), persisted
 * to localStorage. The notifications flag is mirrored to the Rust engine on
 * load and on every change so sweep OS-notifications are gated server-side.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())

  // Sync the initial notifications flag to the Rust engine.
  useEffect(() => {
    setNotificationsEnabled(settings.notifications).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = useCallback((next: Settings) => {
    setSettings(next)
    saveSettings(next)
    setNotificationsEnabled(next.notifications).catch(() => {})
  }, [])

  return { settings, update }
}
