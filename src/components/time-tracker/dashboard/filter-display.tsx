import { X } from 'lucide-react'

// ─── Shared filter display components ───────────────────────────────────────

/** Renders an active filter count badge with clear button (inline style). */
export function ActiveFilterBadge({
  activeFilterCount,
  onClear,
}: {
  activeFilterCount: number
  onClear: () => void
}) {
  if (activeFilterCount === 0) return null
  return (
    <>
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
        {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
      </span>
      <button
        type="button"
        onClick={onClear}
        className="text-xs font-semibold text-destructive hover:underline"
      >
        Clear
      </button>
    </>
  )
}

/** Renders an active filter clear button with count badge (bordered style). */
export function ActiveFilterClearButton({
  activeFilterCount,
  onClear,
}: {
  activeFilterCount: number
  onClear: () => void
}) {
  if (activeFilterCount === 0) return null
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
    >
      <X className="size-3" />
      Clear ({activeFilterCount})
    </button>
  )
}
