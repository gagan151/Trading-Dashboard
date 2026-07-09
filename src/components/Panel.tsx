import type { ReactNode } from 'react'

export function Panel({
  title,
  children,
  className = '',
  bodyClassName = 'p-3',
}: {
  title: string
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`bg-panel border border-border rounded-lg flex flex-col min-h-0 ${className}`}>
      <header className="px-3 py-2 border-b border-border text-[11px] font-semibold tracking-wider text-muted uppercase">
        {title}
      </header>
      <div className={`flex-1 min-h-0 overflow-auto ${bodyClassName}`}>{children}</div>
    </section>
  )
}
