import { useEffect, useState } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'

import { onConnection, onTick, startStream } from '../lib/tauri'
import type { ConnectionStatus, Tick } from '../lib/types'

/**
 * Starts the Yahoo live stream (WebSocket + REST polling) and exposes the
 * latest tick per symbol + connection status. Handles the Tauri listen race
 * where cleanup can run before `listen()` resolves (React StrictMode / HMR).
 */
export function useStream(symbols: readonly string[]) {
  const [ticks, setTicks] = useState<Record<string, Tick>>({})
  const [conn, setConn] = useState<ConnectionStatus | null>(null)

  useEffect(() => {
    let alive = true
    let unTick: UnlistenFn | undefined
    let unConn: UnlistenFn | undefined

    const pTick = onTick((t) => {
      if (alive) setTicks((prev) => ({ ...prev, [t.symbol]: t }))
    })
    const pConn = onConnection((c) => {
      if (alive) setConn(c)
    })

    // If cleanup already ran by the time the listener resolves, unlisten immediately.
    pTick.then((u) => {
      if (alive) unTick = u
      else u()
    })
    pConn.then((u) => {
      if (alive) unConn = u
      else u()
    })

    startStream([...symbols]).catch((e: unknown) =>
      setConn({ status: 'error', detail: String(e) })
    )

    return () => {
      alive = false
      unTick?.()
      unConn?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')])

  return { ticks, conn }
}
