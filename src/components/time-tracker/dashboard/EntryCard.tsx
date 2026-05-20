import { memo, useMemo, useState } from 'react'
import { Copy, Loader2, Pencil, Play, Trash2 } from 'lucide-react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import { formatCurrency } from '#/lib/time-tracker/billing'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { ConfirmDialog } from './ConfirmDialog'
import { useNowTick } from './hooks/useNowTick'

export const EntryCard = memo(function EntryCard({
  entry,
  projects,
  tags,
  currency,
  rateLookup,
  pending,
  isPending,
  formatTime,
  hasActiveTimer,
  onStartEdit,
  onResume,
  onDuplicate,
  onDelete,
}: {
  entry: TimeEntry
  projects: Project[]
  tags: SearchableItem[]
  currency: string
  rateLookup: (memberId: string) => number
  pending: boolean
  isPending?: boolean
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
  onStartEdit: () => void
  onResume: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const isRunning = !entry.endedAt
  const tick = useNowTick(isRunning ? 1000 : null)

  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const project = useMemo(
    () => projects.find((p) => p.id === entry.projectId),
    [projects, entry.projectId],
  )
  const entryTags = useMemo(
    () => tags.filter((t) => entry.tagIds.includes(t.id)),
    [tags, entry.tagIds],
  )
  const seconds = getEntrySeconds(entry, tick)
  const actionsDisabled = pending || !!isPending

  const start = new Date(entry.startedAt)
  const end = entry.endedAt ? new Date(entry.endedAt) : null
  const timeRange = end
    ? `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – now`

  return (
    <div
      className={`rounded-lg border bg-background p-3 shadow-sm ${
        isRunning ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 font-semibold leading-snug text-foreground">
          {entry.description || (
            <span className="text-muted-foreground">No description</span>
          )}
        </p>
        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
          {formatTime(seconds)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {project && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            {project.name}
          </span>
        )}
        {entryTags.map((tag) => (
          <span
            key={tag.id}
            className="rounded-md border px-2 py-0.5 text-xs font-semibold"
            style={{ color: tag.color, borderColor: `${tag.color}55` }}
          >
            {tag.name}
          </span>
        ))}
        {entry.billable && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
            Billable
          </span>
        )}
        {isRunning && (
          <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-bold text-destructive">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
            Running
          </span>
        )}
        {isPending && (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Syncing
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="m-0 text-xs text-muted-foreground">{timeRange}</p>
          {entry.billable && (
            <p className="m-0 mt-0.5 text-xs font-semibold text-muted-foreground">
              {formatCurrency(
                (seconds / 3600) * rateLookup(entry.workspaceMemberId),
                currency,
              )}
            </p>
          )}
        </div>
        <div className="flex gap-1.5">
          {entry.endedAt && (
            <button
              type="button"
              onClick={onResume}
              disabled={actionsDisabled || hasActiveTimer}
              title={
                hasActiveTimer
                  ? 'Stop the running timer first'
                  : 'Resume this task'
              }
              className="rounded-lg border border-primary/40 p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Resume entry"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onStartEdit}
            disabled={actionsDisabled}
            className="rounded-lg border border-border p-1.5 text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            aria-label="Edit entry"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowDuplicateDialog(true)}
            disabled={actionsDisabled}
            className="rounded-lg border border-border p-1.5 text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            aria-label="Duplicate entry"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            disabled={actionsDisabled}
            className="rounded-lg border border-destructive/30 p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            aria-label="Delete entry"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        title="Duplicate Entry"
        description={`Duplicate "${entry.description}"? A new entry with the same details will be created.`}
        confirmLabel="Duplicate"
        onConfirm={() => {
          if (actionsDisabled) return
          onDuplicate()
          setShowDuplicateDialog(false)
        }}
        pending={pending}
      />
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Entry"
        description={`Delete "${entry.description}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (actionsDisabled) return
          onDelete()
          setShowDeleteDialog(false)
        }}
        pending={pending}
      />
    </div>
  )
})
