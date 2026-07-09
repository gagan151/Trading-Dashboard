import { useEffect, useState } from 'react'

/** Live New York time string, updating every second (auto DST via IANA tz). */
export function useNyClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  })
}

/** Current New York Date components (weekday 0=Sun..6=Sat, hour 0-23, minute 0-59). */
export function nyComponents(d = new Date()): { weekday: number; hour: number; minute: number } {
  const opts = { timeZone: 'America/New_York', hour12: false } as const
  const wdStr = new Intl.DateTimeFormat('en-US', { ...opts, weekday: 'short' }).format(d)
  let hour = Number(new Intl.DateTimeFormat('en-US', { ...opts, hour: '2-digit' }).format(d))
  const minute = Number(new Intl.DateTimeFormat('en-US', { ...opts, minute: '2-digit' }).format(d))
  if (hour === 24) hour = 0 // some runtimes emit "24" at midnight
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wdStr)
  return { weekday, hour, minute }
}
