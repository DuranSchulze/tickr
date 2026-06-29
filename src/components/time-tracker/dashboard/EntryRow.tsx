import { memo, useCallback, useMemo, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import {
  CalendarDays,
  Clock,
  CornerDownRight,
  Copy,
  Loader2,
  MoreVertical,
  Play,
  Radio,
  Trash2,
  X,
} from 'lucide-react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { Calendar } from '#/components/ui/calendar'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { TableCell, TableRow } from '#/components/ui/table'
import { ClientProjectPicker } from '../pickers/ClientProjectPicker'
import { TagPicker } from '../pickers/TagPicker'
import { BillableToggleButton } from './BillableToggleButton'
import { ConfirmDialog } from './ConfirmDialog'
import { useNowTick } from './hooks/useNowTick'

const noopCreate = () => Promise.resolve()

// ─── Live ticking duration ────────────────────────────────────────────────
// Extracted from EntryRow so only the tiny duration text re-renders every
// second — the entire row (pickers, dropdowns, editors) stays memoized.

const LiveDuration = memo(function LiveDuration({
  entry,
  formatTime,
}: {
  entry: TimeEntry
  formatTime: (seconds: number) => string
}) {
  const isRunning = !entry.endedAt
  const tick = useNowTick(isRunning ? getFormatterLiveTickMs(formatTime) : null)
  return (
    <span className="font-mono text-sm font-bold tabular-nums text-foreground">
      {formatTime(getEntrySeconds(entry, tick))}
    </span>
  )
})

type InlinePatch = Partial<
  Pick<
    TimeEntry,
    | 'description'
    | 'billable'
    | 'taskId'
    | 'projectId'
    | 'tagIds'
    | 'startedAt'
    | 'endedAt'
  >
>

type ClientItem = { id: string; name: string; clientStatus: string }

function toTimeInput(isoStr: string): string {
  const d = new Date(isoStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function patchDateAndTime(
  isoStr: string,
  date: Date,
  timeInput: string,
): string {
  const next = new Date(isoStr)
  const [hours, minutes] = timeInput.split(':').map(Number)
  next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
  next.setHours(hours, minutes, 0, 0)
  return next.toISOString()
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

type TimeEditorState = {
  open: boolean
  dateRange: DateRange
  startTime: string
  endTime: string
}

function getTimeEditorState(entry: TimeEntry, open: boolean): TimeEditorState {
  const start = new Date(entry.startedAt)
  const end = new Date(entry.endedAt ?? entry.startedAt)
  return {
    open,
    dateRange: { from: start, to: entry.endedAt ? end : undefined },
    startTime: toTimeInput(entry.startedAt),
    endTime: entry.endedAt ? toTimeInput(entry.endedAt) : '',
  }
}

function EntryTimeCell({
  entry,
  onUpdate,
}: {
  entry: TimeEntry
  onUpdate: (patch: InlinePatch) => void
}) {
  const [timeEditor, setTimeEditor] = useState(() =>
    getTimeEditorState(entry, false),
  )
  const isRunning = !entry.endedAt
  const { open, dateRange, startTime, endTime } = timeEditor
  const actualStartDate = new Date(entry.startedAt)
  const actualEndDate = entry.endedAt ? new Date(entry.endedAt) : null
  const spansDates =
    !!actualEndDate && !isSameLocalDate(actualStartDate, actualEndDate)
  const draftStartDate = dateRange.from ?? new Date(entry.startedAt)
  const draftEndDate = dateRange.to ?? draftStartDate
  const draftStartIso = patchDateAndTime(
    entry.startedAt,
    draftStartDate,
    startTime,
  )
  const draftEndIso =
    entry.endedAt && endTime
      ? patchDateAndTime(entry.endedAt, draftEndDate, endTime)
      : null
  const hasTimeError =
    !!draftEndIso && new Date(draftEndIso) <= new Date(draftStartIso)

  function openEditor() {
    setTimeEditor(getTimeEditorState(entry, true))
  }

  function updateTimeEditor(patch: Partial<TimeEditorState>) {
    setTimeEditor((current) => ({ ...current, ...patch }))
  }

  function selectRangeDay(day: Date) {
    if (!dateRange.from || dateRange.to) {
      updateTimeEditor({ dateRange: { from: day, to: undefined } })
      return
    }

    updateTimeEditor({
      dateRange:
        day < dateRange.from
          ? { from: day, to: dateRange.from }
          : { from: dateRange.from, to: day },
    })
  }

  function saveTimeChange() {
    if (!startTime || hasTimeError) return
    const patch: InlinePatch = { startedAt: draftStartIso }
    if (entry.endedAt && draftEndIso) patch.endedAt = draftEndIso
    onUpdate(patch)
    updateTimeEditor({ open: false })
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="inline-flex min-h-10 w-full min-w-[7.5rem] items-center justify-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
        title="Edit date and time"
        aria-label="Edit date and time"
      >
        <span className="grid min-w-0 justify-items-end gap-0.5 text-xs leading-tight tabular-nums">
          <span className="font-semibold text-foreground">
            {spansDates
              ? `${formatShortDate(actualStartDate)} ${formatTimeDisplay(entry.startedAt)}`
              : formatTimeDisplay(entry.startedAt)}
          </span>
          <span className="text-muted-foreground">
            {isRunning
              ? 'now'
              : spansDates
                ? `${formatShortDate(actualEndDate)} ${formatTimeDisplay(entry.endedAt!)}`
                : formatTimeDisplay(entry.endedAt!)}
          </span>
        </span>
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => updateTimeEditor({ open: nextOpen })}
      >
        <DialogContent
          className="top-3 flex max-h-[min(90dvh,42rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:top-1/2 sm:max-w-xl sm:-translate-y-1/2 md:max-w-2xl"
          showCloseButton={false}
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-5 py-4">
            <DialogTitle>Edit Date & Time</DialogTitle>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close time editor"
                title="Close"
              >
                <X className="size-4" />
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [-webkit-overflow-scrolling:touch] sm:p-4">
            <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
              <div className="rounded-md border border-border p-2">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  defaultMonth={dateRange.from}
                  onSelect={() => undefined}
                  onDayClick={selectRangeDay}
                  autoFocus
                  className="w-full bg-card p-2 [--cell-size:--spacing(8)] sm:[--cell-size:--spacing(9)]"
                  classNames={{
                    root: 'w-full',
                    month: 'flex w-full min-w-0 flex-col gap-4',
                    day: 'group/day relative aspect-square size-full rounded-(--cell-radius) p-0 text-center select-none',
                  }}
                />
              </div>

              <div className="grid content-start gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-sm text-muted-foreground">
                    <span className="block text-xs font-semibold uppercase tracking-wide">
                      Start date
                    </span>
                    <span className="font-semibold">
                      {draftStartDate.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-sm text-muted-foreground">
                    <span className="block text-xs font-semibold uppercase tracking-wide">
                      End date
                    </span>
                    <span className="font-semibold">
                      {isRunning
                        ? 'Running'
                        : draftEndDate.toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                    </span>
                  </div>
                </div>
                <p className="m-0 text-xs text-muted-foreground">
                  Select one date for a same-day entry, or select a start and
                  end date for overnight or multi-day work.
                </p>

                <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                  Start time
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) =>
                      updateTimeEditor({ startTime: event.target.value })
                    }
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                  End time
                  <input
                    type="time"
                    value={isRunning ? '' : endTime}
                    onChange={(event) =>
                      updateTimeEditor({ endTime: event.target.value })
                    }
                    disabled={isRunning}
                    placeholder={isRunning ? 'Running timer' : undefined}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  />
                </label>

                {hasTimeError && (
                  <p className="m-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                    End date and time must be after the start date and time.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4 [&_button]:w-full sm:[&_button]:w-auto">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={saveTimeChange}
              disabled={
                hasTimeError || !startTime || (!!entry.endedAt && !endTime)
              }
            >
              Save Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function formatTimeDisplay(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const EntryRow = memo(function EntryRow({
  entry,
  clients,
  projects,
  projectTasks,
  tags,
  pending,
  isPending,
  isDeleting,
  formatTime,
  isSubEntry,
  onStartEdit,
  onUpdate,
  onResume,
  onDuplicate,
  onDelete,
}: {
  entry: TimeEntry
  clients: ClientItem[]
  projects: Project[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: SearchableItem[]
  pending: boolean
  isPending?: boolean
  isDeleting?: boolean
  formatTime: (seconds: number) => string
  isSubEntry?: boolean
  currency?: string
  rateLookup?: (memberId: string) => number
  // Entry-aware handlers: the same stable function reference is shared by
  // every row, so React.memo can actually skip unchanged rows.
  onStartEdit: (entry: TimeEntry) => void
  onUpdate: (entryId: string, patch: InlinePatch) => void
  onResume: (entry: TimeEntry) => void
  onDuplicate: (entryId: string) => void
  onDelete: (entryId: string) => void
}) {
  const update = (patch: InlinePatch) => onUpdate(entry.id, patch)
  const isRunning = !entry.endedAt

  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [draftDesc, setDraftDesc] = useState(() => entry.description)
  const descInputRef = useRef<HTMLInputElement>(null)
  const skipDescCommit = useRef(false)

  // Callback ref: focus the description input as soon as it mounts (when the
  // user clicks to edit). Memoised so it fires only on mount, not every render.
  const attachDescInput = useCallback((el: HTMLInputElement | null) => {
    descInputRef.current = el
    el?.focus()
  }, [])

  const activeClients = useMemo(
    () => clients.filter((c) => c.clientStatus === 'ACTIVE'),
    [clients],
  )
  const entryProject = useMemo(
    () => projects.find((p) => p.id === entry.projectId),
    [projects, entry.projectId],
  )
  const actionsDisabled = pending || !!isPending

  // Single commit path (via blur). Enter/Escape blur the input rather than
  // committing directly, so we never fire two updates for one edit.
  function commitDesc() {
    if (skipDescCommit.current) {
      skipDescCommit.current = false
      setEditDesc(false)
      return
    }
    const next = draftDesc.trim()
    if (next && next !== entry.description) update({ description: next })
    setEditDesc(false)
  }

  return (
    <TableRow
      className={
        isDeleting
          ? 'opacity-50 pointer-events-none'
          : isRunning
            ? 'bg-primary/5 opacity-75'
            : isSubEntry
              ? 'bg-muted/20'
              : ''
      }
    >
      {/* Description — inline editable */}
      <TableCell className="py-3 px-4 w-[26%]">
        <div
          className={`flex min-w-0 items-center gap-2 ${isSubEntry ? 'pl-5' : ''}`}
        >
          {isSubEntry && (
            <span
              aria-hidden="true"
              className="inline-flex shrink-0 items-center text-muted-foreground/60"
            >
              <CornerDownRight className="size-3.5" />
            </span>
          )}
          {isRunning && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Radio className="size-2.5 fill-current" />
              Ongoing
            </span>
          )}
          <div className="min-w-0 flex-1">
            {editDesc ? (
              <input
                ref={attachDescInput}
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                onBlur={commitDesc}
                aria-label="Task description"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    descInputRef.current?.blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    skipDescCommit.current = true
                    setDraftDesc(entry.description)
                    descInputRef.current?.blur()
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="block max-w-full cursor-text truncate border-0 bg-transparent p-0 text-left text-sm font-semibold text-foreground hover:underline focus:outline-none focus:ring-1 focus:ring-primary"
                title={entry.description || 'No description'}
                onClick={() => {
                  setDraftDesc(entry.description)
                  setEditDesc(true)
                }}
              >
                {entry.description || (
                  <span className="text-muted-foreground font-normal">
                    No description
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </TableCell>

      {/* Client + Project — same picker used in the timer bar & edit drawer */}
      <TableCell className="py-3 px-4 w-[18%]">
        <div className="flex h-9 items-center">
          <ClientProjectPicker
            clients={activeClients}
            projects={projects}
            tasks={projectTasks}
            clientId={entryProject?.clientId ?? ''}
            projectId={entry.projectId}
            taskId={entry.taskId ?? ''}
            onChange={(_clientId, projectId, taskId) =>
              update({ projectId, taskId: taskId ?? null })
            }
            disabled={actionsDisabled}
            compact
          />
        </div>
      </TableCell>

      {/* Tags — same picker used in the timer bar & edit drawer */}
      <TableCell className="py-3 px-4 w-[14%]">
        <div className="h-9">
          <TagPicker
            tags={tags}
            value={entry.tagIds}
            onChange={(ids) => update({ tagIds: ids })}
            onCreate={noopCreate}
            canCreate={false}
            disabled={actionsDisabled}
            bare
          />
        </div>
      </TableCell>

      {/* Billable */}
      <TableCell className="py-3 px-4 w-[8%] text-center">
        <BillableToggleButton
          pressed={entry.billable}
          onPressedChange={(b) => update({ billable: b })}
          className="size-8 mx-auto"
        />
      </TableCell>

      {/* Time — start/end with calendar date picker */}
      <TableCell className="py-3 px-4 w-[12%] text-center">
        <EntryTimeCell key={entry.id} entry={entry} onUpdate={update} />
      </TableCell>

      {/* Duration */}
      <TableCell className="py-3 px-4 w-[10%] text-right">
        <LiveDuration entry={entry} formatTime={formatTime} />
      </TableCell>

      {/* Actions */}
      <TableCell className="py-3 px-4 w-[12%]">
        {isDeleting ? (
          <div className="flex items-center justify-end gap-1.5">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Deleting…</span>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            {!isSubEntry && entry.endedAt ? (
              <button
                type="button"
                onClick={() => onResume(entry)}
                disabled={actionsDisabled}
                title="Resume this task"
                className="rounded-lg border border-primary/40 p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Resume entry"
              >
                <Play className="size-3.5" />
              </button>
            ) : (
              <span
                aria-hidden="true"
                className="size-8 shrink-0 rounded-lg border border-transparent"
              />
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={actionsDisabled}
                className="inline-flex h-8 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="More actions"
                title="More actions"
              >
                <MoreVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onStartEdit(entry)}>
                  <Clock className="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
                {!isSubEntry && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setShowDuplicateDialog(true)}
                    >
                      <Copy className="mr-2 size-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </TableCell>

      <ConfirmDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        title="Duplicate Entry"
        description={`Are you sure you want to duplicate "${entry.description}"? This will create a new entry with the same details.`}
        confirmLabel="Duplicate"
        onConfirm={() => {
          if (actionsDisabled) return
          onDuplicate(entry.id)
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
          onDelete(entry.id)
          setShowDeleteDialog(false)
        }}
        pending={pending}
      />
    </TableRow>
  )
})
