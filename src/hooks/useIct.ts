import { useEffect, useState } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'

import { getIctState, onIctState } from '../lib/tauri'
import type { IctState } from '../lib/types'

/**
 * Subscribes to the ICT engine state. Fetches once on mount for an immediate
 * render, then updates from the `ict_state` event (emitted every second by the
 * Rust core + immediately on any sweep). Handles the StrictMode/HMR listen race.
 */
export function useIct(): IctState | null {
  const [state, setState] = useState<IctState | null>(null)

  useEffect(() => {
    let alive = true
    let un: UnlistenFn | undefined

    getIctState()
      .then((s) => {
        if (alive) setState(s)
      })
      .catch(() => {
        /* engine not started yet; events will arrive shortly */
      })

    const p = onIctState((s) => {
      if (alive) setState(s)
    })
    p.then((u) => {
      if (alive) un = u
      else u()
    })

    return () => {
      alive = false
      un?.()
    }
  }, [])

  return state
}
