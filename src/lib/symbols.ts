// Config-driven symbol list (plan: NQ=F and ES=F; easy to add YM=F/RTY=F later).

export const SYMBOLS = ['NQ=F', 'ES=F'] as const

export interface SymbolInfo {
  label: string
  name: string
}

export const SYMBOL_INFO: Record<string, SymbolInfo> = {
  'NQ=F': { label: 'NQ', name: 'E-mini Nasdaq-100' },
  'ES=F': { label: 'ES', name: 'E-mini S&P 500' },
}
