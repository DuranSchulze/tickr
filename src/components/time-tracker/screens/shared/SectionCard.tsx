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
    <section className="rounded-xl border border-stone bg-eggshell p-5 shadow-[var(--shadow-whisper)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="m-0 text-lg font-bold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
