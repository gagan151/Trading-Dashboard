import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'

import type {
  Candle,
  ConnectionStatus,
  EconEvent,
  IctState,
  NewsItem,
  Sweep,
  Tick,
} from './types'

export const getHistory = (symbol: string, interval: string, range: string) =>
  invoke<Candle[]>('get_history', { symbol, interval, range })

export const getQuote = (symbol: string) => invoke<Tick>('get_quote', { symbol })

export const startStream = (symbols: string[]) =>
  invoke<void>('start_stream', { symbols })

export const getIctState = () => invoke<IctState>('get_ict_state')

export const getNews = () => invoke<NewsItem[]>('get_news')

export const getEconEvents = () => invoke<EconEvent[]>('get_econ_events')

export const getEconProviderLabel = () =>
  invoke<string>('get_econ_provider_label')

export const setNotificationsEnabled = (enabled: boolean) =>
  invoke<void>('set_notifications_enabled', { enabled })

/** Open a URL in the user's default browser (tauri-plugin-opener). */
export const openExternal = (url: string): Promise<void> => openUrl(url)

export const onTick = (cb: (t: Tick) => void): Promise<UnlistenFn> =>
  listen<Tick>('tick', (e) => cb(e.payload))

export const onConnection = (cb: (c: ConnectionStatus) => void): Promise<UnlistenFn> =>
  listen<ConnectionStatus>('connection', (e) => cb(e.payload))

export const onIctState = (cb: (s: IctState) => void): Promise<UnlistenFn> =>
  listen<IctState>('ict_state', (e) => cb(e.payload))

export const onSweep = (cb: (s: Sweep) => void): Promise<UnlistenFn> =>
  listen<Sweep>('sweep', (e) => cb(e.payload))

export const onNews = (cb: (n: NewsItem[]) => void): Promise<UnlistenFn> =>
  listen<NewsItem[]>('news', (e) => cb(e.payload))

export const onEconEvents = (cb: (e: EconEvent[]) => void): Promise<UnlistenFn> =>
  listen<EconEvent[]>('econ_events', (e) => cb(e.payload))
