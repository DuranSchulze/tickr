import type { ReactNode } from 'react'

export function Page({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <p className="m-0 text-sm font-semibold text-primary">{eyebrow}</p>
        <h1 className="m-0 mt-1 text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
      </div>
      {children}
    </div>
  )
}
