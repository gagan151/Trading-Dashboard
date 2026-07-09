/** Formatting helpers shared by the ICT panels. */

const NY_TZ = 'America/New_York'

/** Fixed-decimal price (defaults to 2 dp; handles NaN/Infinity → '—'). */
export function fmtPrice(n: number, digits = 2): string {
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : '—'
}

/** ET "HH:MM" (24h) from a unix-seconds timestamp. */
export function fmtET(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    timeZone: NY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** ET "HH:MM:SS" (24h) from a unix-seconds timestamp. */
export function fmtETSec(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-US', {
    timeZone: NY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** "H:MM:SS" or "M:SS" countdown from a seconds value. */
export function fmtCountdown(total: number): string {
  if (!Number.isFinite(total) || total < 0) total = 0
  const s = Math.floor(total % 60)
  const m = Math.floor((total / 60) % 60)
  const h = Math.floor(total / 3600)
  const pad = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Human label for a liquidity level, e.g. "Asia High", "PDH", "PWL". */
export function levelLabel(kind: string, side: string): string {
  const sideName = side === 'high' ? 'High' : 'Low'
  switch (kind) {
    case 'Asia':
      return `Asia ${sideName}`
    case 'London':
      return `London ${sideName}`
    case 'PD':
      return side === 'high' ? 'PDH' : 'PDL'
    case 'PW':
      return side === 'high' ? 'PWH' : 'PWL'
    default:
      return `${kind} ${sideName}`
  }
}
