import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { ReactNode } from 'react'

export type CatalogAccent = {
  bg: string
  border: string
  text: string
}

export function CatalogCard({
  title,
  description,
  count,
  icon,
  accent,
  preview,
  onOpen,
}: {
  title: string
  description: string
  count: number
  icon: ReactNode
  accent: CatalogAccent
  preview: ReactNode
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid min-h-[180px] gap-4 rounded-lg border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-11 w-11 place-items-center rounded-lg border ${accent.border} ${accent.bg} ${accent.text}`}
        >
          {icon}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground">
          {count}
        </span>
      </div>
      <div>
        <h2 className="m-0 text-lg font-bold text-foreground">{title}</h2>
        <p className="m-0 mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="mt-auto min-h-7">{preview}</div>
    </button>
  )
}

export function CatalogDialog({
  title,
  description,
  countLabel,
  icon,
  accent,
  canManage,
  createForm,
  children,
  onClose,
}: {
  title: string
  description: string
  countLabel: string
  icon: ReactNode
  accent: CatalogAccent
  canManage: boolean
  createForm: (onSuccess: () => void) => ReactNode
  children: ReactNode
  onClose: () => void
}) {
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <section className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`hidden sm:grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${accent.border} ${accent.bg} ${accent.text}`}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
                {countLabel}
              </p>
              <h2 className="m-0 text-base sm:text-xl font-bold text-foreground leading-tight">
                {title}
              </h2>
              <p className="m-0 mt-0.5 hidden sm:block text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close catalog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: full-width list */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 sm:pb-20">
          {children}
        </div>

        {/* FAB — hidden while form dialog is open */}
        {canManage && !formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="absolute bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
            aria-label="Add new item"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </section>

      {/* Form dialog */}
      {canManage && formOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setFormOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-foreground">
                Add new
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close form"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">{createForm(() => setFormOpen(false))}</div>
          </div>
        </div>
      )}
    </div>
  )
}
