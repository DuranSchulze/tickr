import type { ReactNode } from 'react'

export function IconBtn({
  onClick,
  title,
  children,
  variant = 'default',
  className = '',
}: {
  onClick: () => void
  title: string
  children: ReactNode
  variant?: 'default' | 'danger'
  className?: string
}) {
  const cls =
    variant === 'danger'
      ? 'text-destructive hover:text-destructive'
      : 'text-muted-foreground hover:text-foreground'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1 transition-colors ${cls} ${className}`}
    >
      {children}
    </button>
  )
}
