import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from 'lucide-react'
import { formatDuration, getEntrySeconds } from '#/lib/time-tracker/store'
import { parseDurationInput } from '#/lib/time-tracker/duration-input'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
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
import { SuspendedClientWarning } from '../catalogs/CatalogFormParts'
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

// ─── Inline duration editing ────────────────────────────────────────────
// Completed entries: click the duration to edit it inline — accepts
// "1:30", "1:30:45", "1h 30m", or decimal hours ("1.5"). The start time
// stays fixed and the end time adjusts to match. Running entries keep the
// live ticker.
const DurationCell = memo(function DurationCell({
  entry,
  formatTime,
  onUpdate,
  disabled,
}: {
  entry: TimeEntry
  formatTime: (seconds: number) => string
  onUpdate: (patch: InlinePatch) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [parseError, setParseError] = useState(false)
  const skipCommit = useRef(false)
  const focusInput = useCallback((element: HTMLInputElement | null) => {
    element?.focus()
  }, [])

  function startEditing() {
    if (disabled || !entry.endedAt) return
    skipCommit.current = false
    setDraft(formatDuration(entry.durationSeconds))
    setParseError(false)
    setEditing(true)
  }

  function commitEdit() {
    if (skipCommit.current) {
      skipCommit.current = false
      setEditing(false)
      return
    }
    if (!entry.endedAt) {
      setEditing(false)
      return
    }
    const seconds = parseDurationInput(draft)
    if (seconds === null || seconds <= 0) {
      setParseError(true)
      return
    }
    const newEnd = new Date(
      new Date(entry.startedAt).getTime() + seconds * 1000,
    )
    if (Number.isNaN(newEnd.getTime())) {
      setParseError(true)
      return
    }
    onUpdate({ endedAt: newEnd.toISOString() })
    setEditing(false)
  }

  if (!entry.endedAt) {
    return <LiveDuration entry={entry} formatTime={formatTime} />
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        disabled={disabled}
        title="Edit duration"
        className="rounded-md px-1.5 py-1 font-mono text-sm font-bold tabular-nums text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {formatTime(entry.durationSeconds)}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <input
        ref={focusInput}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setParseError(false)
        }}
        onBlur={commitEdit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            commitEdit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            skipCommit.current = true
            event.currentTarget.blur()
          }
        }}
        aria-label="Duration"
        placeholder="1:30 or 1h 30m"
        className="h-9 w-28 rounded-lg border-2 border-border bg-muted/30 px-2 font-mono text-sm font-semibold tabular-nums text-foreground outline-none transition-colors focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/15"
      />
      {parseError && (
        <p className="m-0 text-[11px] font-semibold leading-tight text-destructive">
          Use 1:30 or 1h 30m
        </p>
      )}
    </div>
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

function isTimeInputValue(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function timeInputToSeconds(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 3600 + minutes * 60
}

function secondsToTimeInput(totalSeconds: number): string {
  const wrapped = ((totalSeconds % 86400) + 86400) % 86400
  const hours = Math.floor(wrapped / 3600)
  const minutes = Math.floor((wrapped % 3600) / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function EntryTimeCell({
  entry,
  onUpdate,
  disabled,
}: {
  entry: TimeEntry
  onUpdate: (patch: InlinePatch) => void
  disabled?: boolean
}) {
  const [startTime, setStartTime] = useState(() => toTimeInput(entry.startedAt))
  const [endTime, setEndTime] = useState(() =>
    entry.endedAt ? toTimeInput(entry.endedAt) : '',
  )
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: new Date(entry.startedAt),
    to: entry.endedAt ? new Date(entry.endedAt) : undefined,
  }))
  // Last committed-complete start value — time inputs emit partial values
  // ("") mid-typing, so deltas are measured from the last valid value.
  const lastValidStartRef = useRef('')
  const isRunning = !entry.endedAt
  const draftStartDate = dateRange.from ?? new Date(entry.startedAt)
  const draftEndDate = dateRange.to ?? draftStartDate
  const hasValidStartTime = isTimeInputValue(startTime)
  const hasValidEndTime = isRunning || isTimeInputValue(endTime)
  const draftStartIso = hasValidStartTime
    ? patchDateAndTime(entry.startedAt, draftStartDate, startTime)
    : null
  const draftEndIso =
    entry.endedAt && hasValidEndTime
      ? patchDateAndTime(entry.endedAt, draftEndDate, endTime)
      : null
  const hasTimeError =
    !!draftStartIso &&
    !!draftEndIso &&
    new Date(draftEndIso) <= new Date(draftStartIso)

  useEffect(() => {
    setStartTime(toTimeInput(entry.startedAt))
    setEndTime(entry.endedAt ? toTimeInput(entry.endedAt) : '')
    lastValidStartRef.current = toTimeInput(entry.startedAt)
    setDateRange({
      from: new Date(entry.startedAt),
      to: entry.endedAt ? new Date(entry.endedAt) : undefined,
    })
  }, [entry.id, entry.startedAt, entry.endedAt])

  // Editing the start time shifts the end time by the same delta so the
  // duration is preserved — the end time "adjusts" in most cases.
  function handleStartTimeChange(value: string) {
    setStartTime(value)
    if (!entry.endedAt || !isTimeInputValue(value)) return
    const delta =
      timeInputToSeconds(value) - timeInputToSeconds(lastValidStartRef.current)
    lastValidStartRef.current = value
    if (delta === 0) return
    if (isTimeInputValue(endTime)) {
      const total = timeInputToSeconds(endTime) + delta
      const dayShift = Math.floor(total / 86400)
      if (dayShift !== 0) {
        setDateRange((range) => {
          const base = range.to ?? range.from ?? new Date(entry.startedAt)
          const next = new Date(base)
          next.setDate(next.getDate() + dayShift)
          return { from: range.from, to: next }
        })
      }
      setEndTime(secondsToTimeInput(total))
    }
  }

  function handleCalendarSelect(day: Date) {
    if (!dateRange.from || dateRange.to) {
      setDateRange({ from: day, to: undefined })
      return
    }

    setDateRange({
      from: day < dateRange.from ? day : dateRange.from,
      to: day < dateRange.from ? dateRange.from : day,
    })
  }

  function commitTimeChange() {
    if (!draftStartIso || !hasValidEndTime || hasTimeError) return

    const patch: InlinePatch = { startedAt: draftStartIso }
    if (entry.endedAt && draftEndIso) patch.endedAt = draftEndIso

    if (
      patch.startedAt === entry.startedAt &&
      patch.endedAt === entry.endedAt
    ) {
      return
    }

    onUpdate(patch)
  }

  return (
    <div className="flex min-w-[14.5rem] flex-col items-center gap-1.5">
      <div className="inline-flex items-center justify-center gap-1.5">
        <input
          type="time"
          value={startTime}
          onChange={(event) => handleStartTimeChange(event.target.value)}
          onBlur={commitTimeChange}
          disabled={disabled}
          aria-label="Start time"
          className="h-9 w-[5.5rem] rounded-lg border-2 border-border bg-muted/30 px-2 text-sm font-semibold tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border/80 focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <span className="text-base font-bold text-muted-foreground select-none">
          —
        </span>
        <input
          type="time"
          value={isRunning ? '' : endTime}
          onChange={(event) => setEndTime(event.target.value)}
          onBlur={commitTimeChange}
          disabled={disabled || isRunning}
          placeholder={isRunning ? 'now' : undefined}
          aria-label="End time"
          className="h-9 w-[5.5rem] rounded-lg border-2 border-border bg-muted/30 px-2 text-sm font-semibold tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border/80 focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
        />

        <Popover
          open={calendarOpen}
          onOpenChange={(nextOpen) => {
            setCalendarOpen(nextOpen)
            if (!nextOpen) commitTimeChange()
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Pick dates"
              title="Pick dates"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-muted/30 text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CalendarDays className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={4} className="w-auto p-2">
            <Calendar
              mode="range"
              selected={dateRange}
              defaultMonth={dateRange.from}
              onSelect={() => undefined}
              onDayClick={handleCalendarSelect}
              className="[--cell-size:--spacing(8)]"
              classNames={{
                day: 'group/day relative aspect-square size-full rounded-(--cell-radius) p-0 text-center select-none',
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {hasTimeError && (
        <p className="m-0 text-[11px] font-semibold leading-tight text-destructive">
          End must be after start
        </p>
      )}
    </div>
  )
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
  rateLookup?: (
    memberId: string,
    projectId?: string,
    dateIso?: string,
  ) => number
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

  const selectableClients = useMemo(
    () => clients.filter((c) => c.clientStatus !== 'INACTIVE'),
    [clients],
  )
  const entryProject = useMemo(
    () => projects.find((p) => p.id === entry.projectId),
    [projects, entry.projectId],
  )
  const entryClient = useMemo(
    () => clients.find((c) => c.id === entryProject?.clientId),
    [clients, entryProject?.clientId],
  )
  const actionsDisabled = !!isPending || !!isDeleting

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
      className={[
        isDeleting ? 'pointer-events-none opacity-50' : '',
        isSubEntry && isRunning
          ? 'bg-primary/10 opacity-80 hover:bg-primary/15 dark:bg-primary/20 dark:hover:bg-primary/25'
          : isRunning
            ? 'bg-primary/5 opacity-75'
            : isSubEntry
              ? 'bg-foreground/[0.045] hover:bg-foreground/[0.065] dark:bg-white/[0.075] dark:hover:bg-white/[0.095]'
              : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Task — description, client/project, and tag controls */}
      <TableCell className="py-3 px-4 w-[56%]">
        <div className={`grid min-w-0 gap-2 ${isSubEntry ? 'pl-5' : ''}`}>
          <div className="flex min-w-0 items-center gap-2">
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

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="h-9 min-w-0 flex-[1_1_18rem] max-w-[26rem]">
              <ClientProjectPicker
                clients={selectableClients}
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
            <div className="h-9 min-w-[8rem] flex-[0_1_12rem]">
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
          </div>

          {entryClient?.clientStatus === 'SUSPENDED' && (
            <div>
              <SuspendedClientWarning clientName={entryClient.name} />
            </div>
          )}
        </div>
      </TableCell>

      {/* Billable */}
      <TableCell className="py-3 px-3 w-[5%] text-center">
        <BillableToggleButton
          pressed={entry.billable}
          onPressedChange={(b) => update({ billable: b })}
          className="size-8 mx-auto"
        />
      </TableCell>

      {/* Time — start/end with calendar date picker */}
      <TableCell className="py-3 px-4 w-[22%] text-center">
        <EntryTimeCell
          entry={entry}
          onUpdate={update}
          disabled={actionsDisabled}
        />
      </TableCell>

      {/* Duration */}
      <TableCell className="py-3 px-3 w-[7%] text-right">
        <DurationCell
          entry={entry}
          formatTime={formatTime}
          onUpdate={update}
          disabled={actionsDisabled}
        />
      </TableCell>

      {/* Actions */}
      <TableCell className="py-3 px-4 w-[10%]">
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
                className="inline-flex h-8 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
                  <DropdownMenuItem
                    onClick={() => setShowDuplicateDialog(true)}
                  >
                    <Copy className="mr-2 size-4" />
                    Duplicate
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
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
