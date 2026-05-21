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
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
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

  const activeClients = useMemo(
    () => clients.filter((c) => c.clientStatus === 'ACTIVE'),
    [clients],
  )
  const entryProject = useMemo(
    () => projects.find((p) => p.id === entry.projectId),
    [projects, entry.projectId],
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

  const startTime = new Date(entry.startedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  const endTime = entry.endedAt
    ? new Date(entry.endedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <TableRow className={isSubEntry ? 'bg-muted/20' : ''}>
      {/* Task — description + time range + duration */}
      <TableCell className="py-2.5 px-4 w-[32%]">
        <div className="flex flex-col gap-0.5 min-w-0">
          {/* Description */}
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
              className="block max-w-full cursor-text truncate border-0 bg-transparent p-0 text-left text-sm font-semibold text-foreground hover:underline focus:outline-none focus:ring-1 focus:ring-primary"
              title={entry.description}
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

          {/* Time range + duration */}
          <div className="flex items-center gap-1.5 font-sans text-xs text-muted-foreground">
            {editStartTime ? (
              <input
                type="time"
                ref={startTimeInputRef}
                className="w-[68px] rounded border border-primary bg-background px-1 py-px text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
                {startTime}
              </button>
            )}

            <span>→</span>

            {entry.endedAt ? (
              editEndTime ? (
                <input
                  type="time"
                  ref={endTimeInputRef}
                  className="w-[68px] rounded border border-primary bg-background px-1 py-px text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
                  {endTime}
                </button>
              )
            ) : (
              <span className="italic">now</span>
            )}

            <span className="font-mono font-bold tabular-nums text-foreground">
              {formatTime(seconds)}
            </span>

            {isPending && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </TableCell>

      {/* Client + Project */}
      <TableCell className="py-2.5 px-4 w-[22%]">
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
      <TableCell className="py-2.5 px-4 w-[18%]">
        <InlineTagPopover
          tags={tags}
          value={entry.tagIds}
          onChange={(ids) => onUpdate({ tagIds: ids })}
          disabled={actionsDisabled}
        />
      </TableCell>

      {/* Billable */}
      <TableCell className="py-2.5 px-4 w-[10%] text-center">
        <BillableToggleButton
          pressed={entry.billable}
          onPressedChange={(b) => onUpdate({ billable: b })}
          className="h-8 w-8 mx-auto"
        />
      </TableCell>

      {/* Actions */}
      <TableCell className="py-2.5 px-4 w-[18%]">
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
              <Play className="h-3.5 w-3.5" />
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={actionsDisabled}
              className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
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
