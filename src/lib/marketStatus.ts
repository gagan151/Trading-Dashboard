import { nyComponents } from './clock'

export interface MarketStatus {
  /** CME Globex futures session open. */
  open: boolean
  label: string
  /** US equity cash session (9:30-16:00 ET, Mon-Fri). */
  cashOpen: boolean
  detail: string
}

/**
 * CME Globex futures schedule (ET):
 *   Sun 18:00 → Fri 17:00, with a daily maintenance halt 17:00-18:00 Mon-Thu.
 *   Friday closes at 17:00; reopens Sunday 18:00. Saturday closed.
 */
export function getMarketStatus(d = new Date()): MarketStatus {
  const { weekday, hour, minute } = nyComponents(d)
  const mins = hour * 60 + minute

  const MAINT_START = 17 * 60 // 17:00
  const MAINT_END = 18 * 60 // 18:00
  const FRI_CLOSE = 17 * 60
  const SUN_OPEN = 18 * 60

  let open = false
  let detail = ''
  if (weekday === 6) {
    // Saturday
    open = false
    detail = 'Closed · weekend (opens Sun 18:00 ET)'
  } else if (weekday === 0) {
    // Sunday
    open = mins >= SUN_OPEN
    detail = open ? 'Globex open' : 'Closed · opens Sun 18:00 ET'
  } else if (weekday === 5) {
    // Friday
    open = mins < FRI_CLOSE
    detail = open ? 'Globex open' : 'Closed for weekend (opens Sun 18:00 ET)'
  } else {
    // Mon-Thu: closed only during 17:00-18:00 maintenance
    open = !(mins >= MAINT_START && mins < MAINT_END)
    detail = open ? 'Globex open' : 'Maintenance halt (17:00-18:00 ET)'
  }

  const cashOpen =
    weekday >= 1 && weekday <= 5 && mins >= 9 * 60 + 30 && mins < 16 * 60

  const label = open ? 'Globex Open' : 'Globex Closed'
  return { open, label, cashOpen, detail }
}
