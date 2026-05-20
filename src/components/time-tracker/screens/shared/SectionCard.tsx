import type { ReactNode } from 'react'

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="m-0 text-lg font-bold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
