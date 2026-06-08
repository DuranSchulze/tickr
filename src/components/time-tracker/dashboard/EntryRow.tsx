import { memo, useCallback, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Clock,
  Copy,
  Loader2,
  MoreHorizontal,
  Play,
  Trash2,
} from 'lucide-react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { Calendar } from '#/components/ui/calendar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { TableCell, TableRow } from '#/components/ui/table'
import { BillableToggleButton } from './BillableToggleButton'
import { ConfirmDialog } from './ConfirmDialog'
import { InlineClientProjectPopover } from './InlineClientProjectPopover'
import { InlineTagPopover } from './InlineTagPopover'
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

type ClientItem = { id: string; name: string; clientStatus: string }

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

function patchDate(isoStr: string, date: Date): string {
  const d = new Date(isoStr)
  d.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
  return d.toISOString()
}

// Inline-editable time text — mirrors the description field's click-to-edit UX.
function InlineTimeField({
  isoStr,
  bold,
  ariaLabel,
  onCommit,
}: {
  isoStr: string
  bold?: boolean
  ariaLabel: string
  onCommit: (timeInput: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => toTimeInput(isoStr))
  const inputRef = useRef<HTMLInputElement>(null)
  const skipCommit = useRef(false)

  // Callback ref: focus the input the moment it mounts (i.e. when the user
  // clicks to edit). Memoised so it only runs on mount/unmount, never on
  // re-render — so typing doesn't re-steal focus.
  const attachInput = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el
    el?.focus()
  }, [])

  // Single commit path (via blur) — Enter/Escape blur instead of committing
  // directly, so one edit never fires two updates.
  function commit() {
    if (skipCommit.current) {
      skipCommit.current = false
      setEditing(false)
      return
    }
    if (draft && draft !== toTimeInput(isoStr)) onCommit(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={attachInput}
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            skipCommit.current = true
            setDraft(toTimeInput(isoStr))
            inputRef.current?.blur()
          }
        }}
        aria-label={ariaLabel}
        className="box-border h-6 w-[5.25rem] rounded border border-border bg-background px-1 text-xs tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(toTimeInput(isoStr))
        setEditing(true)
      }}
      title="Edit time"
      className={`cursor-text rounded px-0.5 hover:underline focus:outline-none focus:ring-1 focus:ring-primary ${
        bold ? 'font-semibold text-foreground' : 'text-muted-foreground'
      }`}
    >
      {formatTimeDisplay(isoStr)}
    </button>
  )
}

function EntryTimeCell({
  entry,
  onUpdate,
}: {
  entry: TimeEntry
  onUpdate: (patch: InlinePatch) => void
}) {
  const [open, setOpen] = useState(false)
  const isRunning = !entry.endedAt

  // Date change — patch both start & end in a single mutation.
  function handleDateSelect(date: Date | undefined) {
    if (!date) return
    const patch: InlinePatch = { startedAt: patchDate(entry.startedAt, date) }
    if (entry.endedAt) patch.endedAt = patchDate(entry.endedAt, date)
    onUpdate(patch)
    setOpen(false)
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <div className="grid justify-items-end gap-0.5 text-xs leading-tight tabular-nums">
        <InlineTimeField
          isoStr={entry.startedAt}
          bold
          ariaLabel="Start time"
          onCommit={(t) =>
            onUpdate({ startedAt: patchTime(entry.startedAt, t) })
          }
        />
        {isRunning ? (
          <span className="px-0.5 italic text-muted-foreground">now</span>
        ) : (
          <InlineTimeField
            isoStr={entry.endedAt!}
            ariaLabel="End time"
            onCommit={(t) =>
              onUpdate({ endedAt: patchTime(entry.endedAt!, t) })
            }
          />
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Change date"
            aria-label="Change task date"
          >
            <CalendarDays className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={new Date(entry.startedAt)}
            defaultMonth={new Date(entry.startedAt)}
            onSelect={handleDateSelect}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
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
  tags,
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
  clients: ClientItem[]
  projects: Project[]
  tags: SearchableItem[]
  pending: boolean
  isPending?: boolean
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
  isSubEntry?: boolean
  currency?: string
  rateLookup?: (memberId: string) => number
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
    if (next && next !== entry.description) onUpdate({ description: next })
    setEditDesc(false)
  }

  return (
    <TableRow className={isSubEntry ? 'bg-muted/20' : ''}>
      {/* Description — inline editable */}
      <TableCell className="py-3 px-4 w-[26%]">
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
        {isPending && (
          <Loader2 className="mt-1 size-3 animate-spin text-muted-foreground" />
        )}
      </TableCell>

      {/* Client + Project */}
      <TableCell className="py-3 px-4 w-[18%]">
        <InlineClientProjectPopover
          clients={activeClients}
          projects={projects}
          clientId={entryProject?.clientId ?? ''}
          projectId={entry.projectId}
          onChange={(_clientId, projectId) => onUpdate({ projectId })}
          disabled={actionsDisabled}
        />
      </TableCell>

      {/* Tags */}
      <TableCell className="py-3 px-4 w-[14%]">
        <InlineTagPopover
          tags={tags}
          value={entry.tagIds}
          onChange={(ids) => onUpdate({ tagIds: ids })}
          disabled={actionsDisabled}
        />
      </TableCell>

      {/* Billable */}
      <TableCell className="py-3 px-4 w-[8%] text-center">
        <BillableToggleButton
          pressed={entry.billable}
          onPressedChange={(b) => onUpdate({ billable: b })}
          className="size-8 mx-auto"
        />
      </TableCell>

      {/* Time — start/end with calendar date picker */}
      <TableCell className="py-3 px-4 w-[12%] text-center">
        <EntryTimeCell key={entry.id} entry={entry} onUpdate={onUpdate} />
      </TableCell>

      {/* Duration */}
      <TableCell className="py-3 px-4 w-[10%] text-right">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
          {formatTime(seconds)}
        </span>
      </TableCell>

      {/* Actions */}
      <TableCell className="py-3 px-4 w-[12%]">
        <div className="flex items-center justify-end gap-1">
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
              <Play className="size-3.5" />
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={actionsDisabled}
              className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onStartEdit}>
                <Clock className="mr-2 size-4" />
                Edit date / time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>

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
    </TableRow>
  )
})
