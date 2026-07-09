// Types mirrored from the Rust core (src-tauri/src/types.rs).

export interface Candle {
  time: number // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Tick {
  symbol: string
  price: number
  change: number
  change_percent: number
  day_high: number
  day_low: number
  previous_close: number
  open_price: number
  time: number // unix seconds
  market_hours: number // 0 regular, 1 pre, 2 post
  source: string // "ws" | "poll"
}

export interface ConnectionStatus {
  status: string // "connected" | "polling" | "reconnecting" | "error"
  detail: string
}

// ICT engine types mirrored from src-tauri/src/ict.rs.

export interface LevelInfo {
  kind: string // "Asia" | "London" | "PD" | "PW"
  side: string // "high" | "low"
  value: number
  present: boolean
  swept: boolean
  swept_at: number | null // unix seconds
  locked: boolean
}

export interface SymbolIct {
  last_price: number
  levels: LevelInfo[]
}

export interface KillzoneInfo {
  name: string
  start: number // unix seconds
  end: number
  active: boolean
}

export interface MacroInfo {
  label: string
  start: number
  end: number
  status: string // "active" | "done" | "upcoming"
}

export interface NextMacro {
  label: string
  start: number
  seconds_until: number
}

export interface IctState {
  et_time: string
  et_date: string
  active_session: string
  today_killzones: KillzoneInfo[]
  today_macros: MacroInfo[]
  next_macro: NextMacro | null
  symbols: Record<string, SymbolIct>
}

export interface Sweep {
  symbol: string
  kind: string
  side: string
  value: number
  price: number
  time: number
}

// News + economic events (mirrored from src-tauri/src/news/mod.rs).

export interface NewsItem {
  title: string
  publisher: string
  link: string
  time: number // unix seconds
  thumbnail: string | null
}

export interface EconEvent {
  country: string
  event: string
  time: number // unix seconds (0 if undated)
  impact: string // "high" | "medium" | "low" | ""
  actual: string
  forecast: string
  previous: string
  unit: string
}
