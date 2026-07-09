import { useEffect, useState } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'

import {
  getEconEvents,
  getEconProviderLabel,
  getNews,
  onEconEvents,
  onNews,
} from '../lib/tauri'
import type { EconEvent, NewsItem } from '../lib/types'

export interface NewsEventsState {
  news: NewsItem[]
  events: EconEvent[]
  providerLabel: string
}

/**
 * Subscribes to news + economic events. Fetches cached values on mount for an
 * immediate render, then updates from the `news` / `econ_events` events
 * (emitted on initial fetch and every 5/10 min by the Rust service).
 */
export function useNewsEvents(): NewsEventsState {
  const [news, setNews] = useState<NewsItem[]>([])
  const [events, setEvents] = useState<EconEvent[]>([])
  const [providerLabel, setProviderLabel] = useState('none')

  useEffect(() => {
    let alive = true
    let unN: UnlistenFn | undefined
    let unE: UnlistenFn | undefined

    getNews()
      .then((n) => alive && setNews(n))
      .catch(() => {})
    getEconEvents()
      .then((e) => alive && setEvents(e))
      .catch(() => {})
    getEconProviderLabel()
      .then((l) => alive && setProviderLabel(l))
      .catch(() => {})

    const pN = onNews((n) => alive && setNews(n))
    const pE = onEconEvents((e) => alive && setEvents(e))
    pN.then((u) => (alive ? (unN = u) : u()))
    pE.then((u) => (alive ? (unE = u) : u()))

    return () => {
      alive = false
      unN?.()
      unE?.()
    }
  }, [])

  return { news, events, providerLabel }
}
