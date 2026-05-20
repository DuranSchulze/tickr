import { useRef } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import { gooeyToast } from 'goey-toast'

export function ListRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
      {children}
    </div>
  )
}

export function CatalogName({ name }: { name: string }) {
  return (
    <p className="m-2 min-w-0 flex-1 truncate text-sm font-bold text-foreground">
      {name}
    </p>
  )
}

export function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="h-3 w-3 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Edit"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
    >
      <Pencil className="h-4 w-4" />
    </button>
  )
}

export function DangerButton({
  title,
  pending,
  onClick,
}: {
  title: string
  pending: boolean
  onClick: () => Promise<void>
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void onClick().catch((err) => {
          gooeyToast.error('Action failed', {
            description:
              err instanceof Error ? err.message : 'Please try again.',
          })
        })
      }}
      disabled={pending}
      title={title}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

export function EmptyCatalog({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <p className="m-0 text-sm font-semibold text-foreground">{label}</p>
    </div>
  )
}

export function EditPanel({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-primary">{title}</span>
        <button
          type="button"
          onClick={onClose}
          title="Cancel edit"
          className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}

export function SelectionBar({
  total,
  selectedCount,
  onToggleAll,
  onBulkDelete,
  deleting,
}: {
  total: number
  selectedCount: number
  onToggleAll: () => void
  onBulkDelete: () => void
  deleting: boolean
}) {
  const allSelected = selectedCount === total && total > 0
  const checkboxRef = useRef<HTMLInputElement>(null)

  if (checkboxRef.current) {
    checkboxRef.current.indeterminate = selectedCount > 0 && !allSelected
  }

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={allSelected}
        onChange={onToggleAll}
        className="h-4 w-4 accent-primary"
      />
      <span className="flex-1 text-xs text-muted-foreground">
        {selectedCount > 0
          ? `${selectedCount} of ${total} selected`
          : `${total} item${total !== 1 ? 's' : ''}`}
      </span>
      {selectedCount > 0 && (
        <button
          type="button"
          onClick={onBulkDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          Delete {selectedCount}
        </button>
      )}
    </div>
  )
}
