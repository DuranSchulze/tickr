import { Fragment } from 'react'
import { ChevronDown, ChevronRight, Copy, Play } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import type { Project, TimeEntry, ViewMode } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { EntryCard } from './EntryCard'
import { EntryRow } from './EntryRow'
import type { DayGroup, TaskGroup } from './entries-grouping'
import { useNowTick } from './hooks/useNowTick'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useStableCallback } from './hooks/useStableCallback'

// ─── Shared types ────────────────────────────────────────────────────────────

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

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function formatTimeDisplay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDtrTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDtrDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDtrDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  })
}

function formatDtrDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long' })
}

function getDayEntries(group: DayGroup) {
  return group.taskGroups.flatMap((taskGroup) => taskGroup.entries)
}

function getDayDtrRow(group: DayGroup) {
  const entries = getDayEntries(group)
  const now = new Date()
  const starts = entries.map((entry) => new Date(entry.startedAt))
  const ends = entries.map((entry) =>
    entry.endedAt ? new Date(entry.endedAt) : now,
  )
  const firstStart = new Date(
    Math.min(...starts.map((date) => date.getTime())),
  )
  const lastEnd = new Date(Math.max(...ends.map((date) => date.getTime())))
  const totalSeconds = entries.reduce(
    (sum, entry) =>
      sum +
      (entry.endedAt
        ? entry.durationSeconds
        : getEntrySeconds(entry, now.getTime())),
    0,
  )

  return [
    formatDtrDate(firstStart),
    formatDtrDay(firstStart),
    formatDtrTime(firstStart),
    formatDtrTime(lastEnd),
    formatDtrDuration(totalSeconds),
    'WORK',
  ].join('\t')
}

async function writeClipboardText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Fall through to the textarea fallback for stricter browser contexts.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('Copy command failed')
}

async function copyDayDtrRow(group: DayGroup) {
  try {
    await writeClipboardText(getDayDtrRow(group))
    gooeyToast.success('DTR row copied')
  } catch {
    gooeyToast.error('Could not copy DTR row')
  }
}

function DayGroupHeaderRow({
  group,
  view,
  entryCount,
  dayCollapsed,
  formatTime,
  onToggle,
}: {
  group: DayGroup
  view?: ViewMode
  entryCount: number
  dayCollapsed: boolean
  formatTime: (seconds: number) => string
  onToggle: () => void
}) {
  const copyButton = (
    <button
      type="button"
      onClick={() => void copyDayDtrRow(group)}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Copy DTR row for Google Sheets"
    >
      <Copy className="size-3.5" />
      Copy
    </button>
  )

  if (view === 'day') {
    return (
      <div className="flex w-full min-w-0 items-center justify-between gap-3 bg-muted/30 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="min-w-0 truncate text-sm font-bold text-foreground">
            {group.label}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {copyButton}
          <LiveGroupTotal
            completedSeconds={group.completedSeconds}
            runningEntry={group.runningEntry}
            formatTime={formatTime}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2 bg-muted/30 px-3 py-3 transition-colors hover:bg-muted/50 sm:px-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="shrink-0">
          {dayCollapsed ? (
            <ChevronRight className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 truncate text-sm font-bold text-foreground">
          {group.label}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          {group.taskGroups.length > 1 && (
            <span className="ml-1 text-muted-foreground/60">
              · {group.taskGroups.length} tasks
            </span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {copyButton}
        <LiveGroupTotal
          completedSeconds={group.completedSeconds}
          runningEntry={group.runningEntry}
          formatTime={formatTime}
        />
      </div>
    </div>
  )
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getTaskGroupTimeBounds(group: TaskGroup) {
  const starts = group.entries.map((entry) => new Date(entry.startedAt))
  const endedEntries = group.entries.filter((entry) => !!entry.endedAt)
  const start = new Date(Math.min(...starts.map((date) => date.getTime())))
  const end = group.runningEntry
    ? null
    : endedEntries.length > 0
      ? new Date(
          Math.max(
            ...endedEntries.map((entry) => new Date(entry.endedAt!).getTime()),
          ),
        )
      : null

  return { start, end }
}

// ─── Live total (ticks when a timer is running) ───────────────────────────────

export function LiveGroupTotal({
  completedSeconds,
  runningEntry,
  formatTime,
}: {
  completedSeconds: number
  runningEntry: TimeEntry | null
  formatTime: (seconds: number) => string
}) {
  const tick = useNowTick(
    runningEntry ? getFormatterLiveTickMs(formatTime) : null,
  )
  const total =
    completedSeconds + (runningEntry ? getEntrySeconds(runningEntry, tick) : 0)
  return (
    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
      {formatTime(total)}
    </span>
  )
}

function GroupTimeSummary({ group }: { group: TaskGroup }) {
  const { start, end } = getTaskGroupTimeBounds(group)
  const spansDates = !!end && !isSameLocalDate(start, end)
  const startLabel = spansDates
    ? `${formatShortDate(start)} ${formatTimeDisplay(start.toISOString())}`
    : formatTimeDisplay(start.toISOString())
  const endLabel = group.runningEntry
    ? 'now'
    : end
      ? spansDates
        ? `${formatShortDate(end)} ${formatTimeDisplay(end.toISOString())}`
        : formatTimeDisplay(end.toISOString())
      : '—'

  return (
    <div className="grid justify-items-end gap-0.5 text-xs leading-tight tabular-nums">
      <span className="font-semibold text-foreground">{startLabel}</span>
      <span className="text-muted-foreground">{endLabel}</span>
    </div>
  )
}

// ─── Task group header row (desktop table) ────────────────────────────────────

function TaskGroupHeaderRow({
  group,
  projects,
  formatTime,
  isExpanded,
  onToggle,
  onResume,
}: {
  group: TaskGroup
  projects: Project[]
  formatTime: (seconds: number) => string
  isExpanded: boolean
  onToggle: () => void
  onResume: () => void
}) {
  const project = projects.find((p) => p.id === group.projectId)

  return (
    <TableRow
      className="cursor-pointer bg-muted/30 transition-colors hover:bg-muted/50"
      onClick={onToggle}
    >
      {/* Description + count + expand toggle */}
      <td className="px-4 py-3 w-[26%]">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={isExpanded ? 'Collapse task group' : 'Expand task group'}
            title={isExpanded ? 'Collapse task group' : 'Expand task group'}
          >
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {group.description || (
                  <span className="text-muted-foreground font-normal">
                    No description
                  </span>
                )}
              </span>
              <span
                className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary"
                title={`${group.entries.length} similar records`}
              >
                ×{group.entries.length}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Grouped task · one-click resume
            </p>
          </div>
        </div>
      </td>

      {/* Project */}
      <td className="px-4 py-3 w-[18%]">
        {project ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate">{project.name}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">–</span>
        )}
      </td>

      {/* Tags */}
      <td className="px-4 py-3 w-[14%]">
        <span className="text-xs text-muted-foreground">
          {group.tagIds.length} tag{group.tagIds.length !== 1 ? 's' : ''}
        </span>
      </td>

      {/* Billable */}
      <td className="px-4 py-3 w-[8%] text-center">
        {group.billable && (
          <span className="text-xs font-bold text-primary">$</span>
        )}
      </td>

      {/* Time (per-entry only) */}
      <td className="px-4 py-3 w-[12%] text-center">
        <GroupTimeSummary group={group} />
      </td>

      {/* Duration */}
      <td className="px-4 py-3 w-[10%] text-right">
        <LiveGroupTotal
          completedSeconds={group.completedSeconds}
          runningEntry={group.runningEntry}
          formatTime={formatTime}
        />
      </td>

      {/* Resume */}
      <td className="px-4 py-3 w-[12%]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onResume}
            title="Resume this task"
            className="rounded-lg border border-primary/40 p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Resume task"
          >
            <Play className="size-3.5" />
          </button>
        </div>
      </td>
    </TableRow>
  )
}

// ─── Task group header card (mobile) ─────────────────────────────────────────

function TaskGroupHeaderCard({
  group,
  projects,
  tags,
  formatTime,
  isExpanded,
  onToggle,
  onResume,
}: {
  group: TaskGroup
  projects: Project[]
  tags: SearchableItem[]
  formatTime: (seconds: number) => string
  isExpanded: boolean
  onToggle: () => void
  onResume: () => void
}) {
  const project = projects.find((p) => p.id === group.projectId)
  const entryTags = tags.filter((t) => group.tagIds.includes(t.id))
  const tick = useNowTick(
    group.runningEntry ? getFormatterLiveTickMs(formatTime) : null,
  )
  const totalSeconds =
    group.completedSeconds +
    (group.runningEntry ? getEntrySeconds(group.runningEntry, tick) : 0)
  const { start, end } = getTaskGroupTimeBounds(group)
  const spansDates = !!end && !isSameLocalDate(start, end)
  const timeSummary = `${spansDates ? `${formatShortDate(start)} ` : ''}${formatTimeDisplay(start.toISOString())} - ${
    group.runningEntry
      ? 'now'
      : end
        ? `${spansDates ? `${formatShortDate(end)} ` : ''}${formatTimeDisplay(end.toISOString())}`
        : '—'
  }`

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </span>
          <span className="truncate font-semibold text-foreground">
            {group.description || (
              <span className="text-muted-foreground">No description</span>
            )}
          </span>
          <span
            className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary"
            title={`${group.entries.length} similar records`}
          >
            ×{group.entries.length}
          </span>
        </div>
        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
          {formatTime(totalSeconds)}
        </span>
      </button>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="m-0 text-xs text-muted-foreground">{timeSummary}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {project && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="min-w-0 truncate">{project.name}</span>
              </span>
            )}
            {entryTags.map((tag) => (
              <span
                key={tag.id}
                className="max-w-full truncate rounded-md border px-2 py-0.5 text-xs font-semibold"
                style={{ color: tag.color, borderColor: `${tag.color}55` }}
                title={tag.name}
              >
                {tag.name}
              </span>
            ))}
            {group.billable && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
                Billable
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onResume}
          title="Resume this task"
          className="rounded-lg border border-primary/40 p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Resume task"
        >
          <Play className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Shared day-grouped list ─────────────────────────────────────────────────
// Single source of truth for the day-grouped entry list shown by both
// EntriesSection (day/week/month) and AllEntriesSection (all). Renders per-day
// headers (static in day view, collapsible otherwise) with collapsible ×N task
// groups, a desktop table and mobile cards.

export function DayGroupsList({
  groups,
  view,
  clients,
  projects,
  projectTasks,
  tags,
  currency,
  rateLookup,
  pending,
  pendingEntryIds,
  deletingEntryId,
  formatTime,
  isDayCollapsed,
  toggleDayGroup,
  isTaskGroupExpanded,
  toggleTaskGroup,
  onStartEdit,
  onUpdate,
  onResume,
  onDuplicate,
  onDelete,
}: {
  groups: DayGroup[]
  view?: ViewMode
  clients: ClientItem[]
  projects: Project[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: SearchableItem[]
  currency: string
  rateLookup: (memberId: string, projectId?: string, dateIso?: string) => number
  pending: boolean
  pendingEntryIds?: Set<string>
  deletingEntryId?: string | null
  formatTime: (seconds: number) => string
  isDayCollapsed: (dateKey: string) => boolean
  toggleDayGroup: (dateKey: string) => void
  isTaskGroupExpanded: (dateKey: string, groupKey: string) => boolean
  toggleTaskGroup: (dateKey: string, groupKey: string) => void
  onStartEdit: (entry: TimeEntry) => void
  onUpdate: (entryId: string, patch: InlinePatch) => void
  onResume: (entry: TimeEntry) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  // Mount only the layout that's actually visible — rendering both the table
  // and the card list (one hidden by CSS) doubled the rows held in the DOM.
  const isDesktop = useIsDesktop()

  // Stable identities so the memoized rows/cards skip re-rendering when an
  // unrelated piece of dashboard state (timer inputs, pickers) changes —
  // the dashboard recreates these handlers on every render.
  const handleStartEdit = useStableCallback(onStartEdit)
  const handleUpdate = useStableCallback(onUpdate)
  const handleResume = useStableCallback(onResume)
  const handleDuplicate = useStableCallback(onDuplicate)
  const handleDelete = useStableCallback(onDelete)

  return (
    <div className="grid min-w-0 gap-3 bg-transparent sm:gap-4">
      {groups.map((group) => {
        const dayCollapsed = isDayCollapsed(group.dateKey)
        const entryCount = group.taskGroups.reduce(
          (n, tg) => n + tg.entries.length,
          0,
        )
        return (
          <div
            key={group.dateKey}
            className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
          >
            {/* Day group header — static in day view, collapsible otherwise */}
            <DayGroupHeaderRow
              group={group}
              view={view}
              entryCount={entryCount}
              dayCollapsed={dayCollapsed}
              formatTime={formatTime}
              onToggle={() => toggleDayGroup(group.dateKey)}
            />

            {/* Expanded day content — always visible in day view */}
            {(view === 'day' || !dayCollapsed) && (
              <>
                {/* Desktop table */}
                {isDesktop && (
                  <div className="hidden min-w-0 sm:block">
                    <Table className="table-fixed">
                      <TableHeader className="bg-muted/50 [&_tr]:border-b-0">
                        <TableRow className="border-b-0 text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                          <TableHead className="px-4 py-2.5 w-[26%] text-muted-foreground font-medium">
                            Task
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[18%] text-muted-foreground font-medium">
                            Client / Project
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[14%] text-muted-foreground font-medium">
                            Tags
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[8%] text-center text-muted-foreground font-medium">
                            Billable
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[12%] text-center text-muted-foreground font-medium">
                            Time
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[10%] text-right text-muted-foreground font-medium">
                            Duration
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[12%]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody className="[&_tr]:border-b-0">
                        {group.taskGroups.map((taskGroup) => {
                          const isGrouped = taskGroup.entries.length > 1
                          const expanded = isTaskGroupExpanded(
                            group.dateKey,
                            taskGroup.key,
                          )

                          if (!isGrouped) {
                            const entry = taskGroup.entries[0]
                            return (
                              <EntryRow
                                key={entry.id}
                                entry={entry}
                                clients={clients}
                                projects={projects}
                                projectTasks={projectTasks}
                                tags={tags}
                                pending={pending}
                                isPending={pendingEntryIds?.has(entry.id)}
                                isDeleting={deletingEntryId === entry.id}
                                formatTime={formatTime}
                                currency={currency}
                                rateLookup={rateLookup}
                                onStartEdit={handleStartEdit}
                                onUpdate={handleUpdate}
                                onResume={handleResume}
                                onDuplicate={handleDuplicate}
                                onDelete={handleDelete}
                              />
                            )
                          }

                          return (
                            <Fragment key={taskGroup.key}>
                              <TaskGroupHeaderRow
                                key={`header-${taskGroup.key}`}
                                group={taskGroup}
                                projects={projects}
                                formatTime={formatTime}
                                isExpanded={expanded}
                                onToggle={() =>
                                  toggleTaskGroup(group.dateKey, taskGroup.key)
                                }
                                onResume={() =>
                                  handleResume(taskGroup.entries[0])
                                }
                              />
                              {expanded &&
                                taskGroup.entries.map((entry) => (
                                  <EntryRow
                                    key={entry.id}
                                    entry={entry}
                                    clients={clients}
                                    projects={projects}
                                    projectTasks={projectTasks}
                                    tags={tags}
                                    pending={pending}
                                    isPending={pendingEntryIds?.has(entry.id)}
                                    isDeleting={deletingEntryId === entry.id}
                                    formatTime={formatTime}
                                    isSubEntry
                                    currency={currency}
                                    rateLookup={rateLookup}
                                    onStartEdit={handleStartEdit}
                                    onUpdate={handleUpdate}
                                    onResume={handleResume}
                                    onDuplicate={handleDuplicate}
                                    onDelete={handleDelete}
                                  />
                                ))}
                            </Fragment>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Mobile cards */}
                {!isDesktop && (
                  <div className="grid min-w-0 gap-2 p-2.5 sm:hidden">
                    {group.taskGroups.map((taskGroup) => {
                      const isGrouped = taskGroup.entries.length > 1
                      const expanded = isTaskGroupExpanded(
                        group.dateKey,
                        taskGroup.key,
                      )

                      if (!isGrouped) {
                        const entry = taskGroup.entries[0]
                        return (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            projects={projects}
                            tags={tags}
                            currency={currency}
                            rateLookup={rateLookup}
                            pending={pending}
                            isPending={pendingEntryIds?.has(entry.id)}
                            isDeleting={deletingEntryId === entry.id}
                            formatTime={formatTime}
                            onStartEdit={handleStartEdit}
                            onResume={handleResume}
                            onDuplicate={handleDuplicate}
                            onDelete={handleDelete}
                          />
                        )
                      }

                      return (
                        <div
                          key={`group-${taskGroup.key}`}
                          className="grid min-w-0 gap-1.5"
                        >
                          <TaskGroupHeaderCard
                            group={taskGroup}
                            projects={projects}
                            tags={tags}
                            formatTime={formatTime}
                            isExpanded={expanded}
                            onToggle={() =>
                              toggleTaskGroup(group.dateKey, taskGroup.key)
                            }
                            onResume={() => handleResume(taskGroup.entries[0])}
                          />
                          {expanded &&
                            taskGroup.entries.map((entry) => (
                              <EntryCard
                                key={entry.id}
                                entry={entry}
                                projects={projects}
                                tags={tags}
                                currency={currency}
                                rateLookup={rateLookup}
                                pending={pending}
                                isPending={pendingEntryIds?.has(entry.id)}
                                isDeleting={deletingEntryId === entry.id}
                                formatTime={formatTime}
                                isSubEntry
                                onStartEdit={handleStartEdit}
                                onResume={handleResume}
                                onDuplicate={handleDuplicate}
                                onDelete={handleDelete}
                              />
                            ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
