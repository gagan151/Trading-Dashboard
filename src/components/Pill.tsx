import type { ReactNode } from 'react'

export type Tone = 'up' | 'down' | 'neutral' | 'amber'

const tones: Record<Tone, string> = {
  up: 'bg-up/15 text-up border-up/30',
  down: 'bg-down/15 text-down border-down/30',
  amber: 'bg-amber/15 text-amber border-amber/30',
  neutral: 'bg-panel-2 text-muted border-border',
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded border ${tones[tone]}`}>
      {children}
    </span>
  )
}
