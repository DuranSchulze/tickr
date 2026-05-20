import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock,
  Copy,
  Loader2,
  MoreHorizontal,
  Play,
  Trash2,
} from 'lucide-react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import { formatCurrency } from '#/lib/time-tracker/billing'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { BillableToggleButton } from './BillableToggleButton'
import { ConfirmDialog } from './ConfirmDialog'
import { ProjectPicker } from '../pickers/ProjectPicker'
import { TagPicker } from '../pickers/TagPicker'
import { useNowTick } from './hooks/useNowTick'

type InlinePatch = Partial<
  Pick<
    TimeEntry,
    | 'description'
    | 'billable'
    | 'projectId'
    | 'tagIds'
    | 'startedAt'
    | 'endedAt'
  >
>

function toTimeInput(isoStr: string): string {
  const d = new Date(isoStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function patchTime(isoStr: string, timeInput: string): string {
  const [h, m] = timeInput.split(':').map(Number)
  const d = new Date(isoStr)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export const EntryRow = memo(function EntryRow({
  entry,
  projects,
  tags,
  currency,
  rateLookup,
  pending,
  isPending,
  formatTime,
  hasActiveTimer,
  isSubEntry,
  onStartEdit,
  onUpdate,
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
  isSubEntry?: boolean
  onStartEdit: () => void
  onUpdate: (patch: InlinePatch) => void
  onResume: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const isRunning = !entry.endedAt
  const tick = useNowTick(isRunning ? 1000 : null)
  const seconds = getEntrySeconds(entry, tick)

  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [draftDesc, setDraftDesc] = useState(() => entry.description)
  const [editStartTime, setEditStartTime] = useState(false)
  const [draftStartTime, setDraftStartTime] = useState(() =>
    toTimeInput(entry.startedAt),
  )
  const [editEndTime, setEditEndTime] = useState(false)
  const [draftEndTime, setDraftEndTime] = useState(() =>
    entry.endedAt ? toTimeInput(entry.endedAt) : '',
  )
  const descInputRef = useRef<HTMLInputElement>(null)
  const startTimeInputRef = useRef<HTMLInputElement>(null)
  const endTimeInputRef = useRef<HTMLInputElement>(null)

  const projectItems: SearchableItem[] = useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    [projects],
  )
  const actionsDisabled = pending || !!isPending

  useEffect(() => {
    if (editDesc) descInputRef.current?.focus()
  }, [editDesc])

  useEffect(() => {
    if (editStartTime) startTimeInputRef.current?.focus()
  }, [editStartTime])

  useEffect(() => {
    if (editEndTime) endTimeInputRef.current?.focus()
  }, [editEndTime])

  function commitDesc() {
    onUpdate({ description: draftDesc })
    setEditDesc(false)
  }

  function commitStartTime() {
    if (!draftStartTime) return
    onUpdate({ startedAt: patchTime(entry.startedAt, draftStartTime) })
    setEditStartTime(false)
  }

  function commitEndTime() {
    if (!draftEndTime || !entry.endedAt) return
    onUpdate({ endedAt: patchTime(entry.endedAt, draftEndTime) })
    setEditEndTime(false)
  }

  return (
    <tr className={`border-t border-border ${isSubEntry ? 'bg-muted/20' : ''}`}>
      {/* Task */}
      <td className="px-4 py-3 w-full min-w-[180px]">
        {isSubEntry ? (
          <div
            className="flex items-center gap-1.5 pl-5 text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            <span className="text-muted-foreground/40">↳</span>
            <span>
              {new Date(entry.startedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>→</span>
            <span>
              {entry.endedAt
                ? new Date(entry.endedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'now'}
            </span>
          </div>
        ) : (
          <>
            {editDesc ? (
              <input
                ref={descInputRef}
                className="w-full rounded border border-border bg-background px-2 py-0.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                onBlur={commitDesc}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDesc()
                  if (e.key === 'Escape') {
                    setDraftDesc(entry.description)
                    setEditDesc(false)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="m-0 block max-w-[260px] cursor-text truncate border-0 bg-transparent p-0 text-left font-semibold text-foreground hover:underline focus:outline-none focus:ring-1 focus:ring-primary"
                title={entry.description}
                onClick={() => {
                  setDraftDesc(entry.description)
                  setEditDesc(true)
                }}
              >
                {entry.description || (
                  <span className="text-muted-foreground">No description</span>
                )}
              </button>
            )}
            <p
              className="m-0 mt-1 text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              {new Date(entry.startedAt).toLocaleString()}
            </p>
          </>
        )}
      </td>

      {/* Project */}
      <td className="px-4 py-3 w-40 min-w-[120px]">
        {!isSubEntry && (
          <ProjectPicker
            projects={projectItems}
            value={entry.projectId}
            onChange={(id) => onUpdate({ projectId: id })}
            onCreate={async () => {}}
            canCreate={false}
            disabled={actionsDisabled}
          />
        )}
      </td>

      {/* Tags */}
      <td className="px-4 py-3 w-44 min-w-[130px]">
        {!isSubEntry && (
          <TagPicker
            tags={tags}
            value={entry.tagIds}
            onChange={(ids) => onUpdate({ tagIds: ids })}
            onCreate={async () => {}}
            canCreate={false}
            disabled={actionsDisabled}
          />
        )}
      </td>

      {/* Billable */}
      <td className="px-4 py-3 w-20 text-center">
        <div
          className={actionsDisabled ? 'pointer-events-none opacity-50' : ''}
        >
          <BillableToggleButton
            pressed={entry.billable}
            onPressedChange={(b) => onUpdate({ billable: b })}
            className="h-8 w-8"
          />
        </div>
      </td>

      {/* Duration */}
      <td className="px-4 py-3 w-48 min-w-[170px] font-mono font-bold tabular-nums text-foreground">
        <div className="flex items-center gap-1.5">
          {formatTime(seconds)}
          {isPending && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Inline start → end time editing */}
        <div className="mt-0.5 flex items-center gap-1 font-sans text-xs text-muted-foreground tabular-nums">
          {editStartTime ? (
            <input
              type="time"
              ref={startTimeInputRef}
              className="w-[72px] rounded border border-primary bg-background px-1 py-px text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              value={draftStartTime}
              onChange={(e) => setDraftStartTime(e.target.value)}
              onBlur={commitStartTime}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitStartTime()
                if (e.key === 'Escape') {
                  setDraftStartTime(toTimeInput(entry.startedAt))
                  setEditStartTime(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="cursor-text rounded border-0 bg-transparent px-0.5 py-0 font-inherit text-inherit hover:bg-accent hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              title="Click to edit start time"
              suppressHydrationWarning
              onClick={() => {
                setDraftStartTime(toTimeInput(entry.startedAt))
                setEditStartTime(true)
              }}
            >
              {new Date(entry.startedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </button>
          )}

          <span>→</span>

          {entry.endedAt ? (
            editEndTime ? (
              <input
                type="time"
                ref={endTimeInputRef}
                className="w-[72px] rounded border border-primary bg-background px-1 py-px text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                value={draftEndTime}
                onChange={(e) => setDraftEndTime(e.target.value)}
                onBlur={commitEndTime}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEndTime()
                  if (e.key === 'Escape') {
                    setDraftEndTime(
                      entry.endedAt ? toTimeInput(entry.endedAt) : '',
                    )
                    setEditEndTime(false)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="cursor-text rounded border-0 bg-transparent px-0.5 py-0 font-inherit text-inherit hover:bg-accent hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                title="Click to edit end time"
                suppressHydrationWarning
                onClick={() => {
                  setDraftEndTime(
                    entry.endedAt ? toTimeInput(entry.endedAt) : '',
                  )
                  setEditEndTime(true)
                }}
              >
                {new Date(entry.endedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </button>
            )
          ) : (
            <span className="italic">now</span>
          )}
        </div>

        {entry.billable && (
          <div className="mt-0.5 font-sans text-xs font-semibold text-muted-foreground tabular-nums">
            {formatCurrency(
              (seconds / 3600) * rateLookup(entry.workspaceMemberId),
              currency,
            )}
          </div>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 w-24 shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Resume — only on standalone rows, not sub-entries (group header has Resume) */}
          {entry.endedAt && !isSubEntry && (
            <button
              type="button"
              onClick={onResume}
              disabled={actionsDisabled || hasActiveTimer}
              title={
                hasActiveTimer
                  ? 'Stop the running timer first'
                  : 'Resume this task'
              }
              className="rounded-lg border border-primary/40 p-2 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Resume entry"
            >
              <Play className="h-4 w-4" />
            </button>
          )}

          {/* More actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={actionsDisabled}
              className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onStartEdit}>
                <Clock className="mr-2 h-4 w-4" />
                Edit date / time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>

      <ConfirmDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        title="Duplicate Entry"
        description={`Are you sure you want to duplicate "${entry.description}"? This will create a new entry with the same details.`}
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
        description={`Are you sure you want to delete "${entry.description}"? This action cannot be undone.`}
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
    </tr>
  )
})
