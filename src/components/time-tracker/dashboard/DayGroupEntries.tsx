import { Fragment } from 'react'
import { ChevronDown, ChevronRight, Play } from 'lucide-react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
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

// ─── Shared formatter for group totals ───────────────────────────────────────

function formatGroupTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
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
  const tick = useNowTick(runningEntry ? 1000 : null)
  const total =
    completedSeconds + (runningEntry ? getEntrySeconds(runningEntry, tick) : 0)
  return (
    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
      {formatTime(total)}
    </span>
  )
}

// ─── Task group header row (desktop table) ────────────────────────────────────

function TaskGroupHeaderRow({
  group,
  projects,
  hasActiveTimer,
  isExpanded,
  onToggle,
  onResume,
}: {
  group: TaskGroup
  projects: Project[]
  hasActiveTimer: boolean
  isExpanded: boolean
  onToggle: () => void
  onResume: () => void
}) {
  const project = projects.find((p) => p.id === group.projectId)

  return (
    <TableRow
      className="bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onToggle}
    >
      {/* Description + count + expand toggle */}
      <td className="px-4 py-3 w-[26%]">
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">
            {group.description || (
              <span className="text-muted-foreground font-normal">
                No description
              </span>
            )}
          </span>
          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
            ×{group.entries.length}
          </span>
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
      <td className="px-4 py-3 w-[12%] text-center text-xs text-muted-foreground">
        —
      </td>

      {/* Duration */}
      <td className="px-4 py-3 w-[10%] text-right">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
          {formatGroupTime(group.totalSeconds)}
        </span>
      </td>

      {/* Resume */}
      <td className="px-4 py-3 w-[12%]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onResume}
            disabled={hasActiveTimer}
            title={
              hasActiveTimer
                ? 'Stop the running timer first'
                : 'Resume this task'
            }
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
  hasActiveTimer,
  isExpanded,
  onToggle,
  onResume,
}: {
  group: TaskGroup
  projects: Project[]
  tags: SearchableItem[]
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
  isExpanded: boolean
  onToggle: () => void
  onResume: () => void
}) {
  const project = projects.find((p) => p.id === group.projectId)
  const entryTags = tags.filter((t) => group.tagIds.includes(t.id))

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-semibold text-foreground">
            {group.description || (
              <span className="text-muted-foreground">No description</span>
            )}
          </span>
          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
            ×{group.entries.length}
          </span>
        </div>
        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
          {formatTime(group.totalSeconds)}
        </span>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {project && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
              <span
                className="size-2 rounded-full"
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
          {group.billable && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
              Billable
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onResume}
          disabled={hasActiveTimer}
          title={
            hasActiveTimer ? 'Stop the running timer first' : 'Resume this task'
          }
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
  formatTime,
  hasActiveTimer,
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
  rateLookup: (memberId: string) => number
  pending: boolean
  pendingEntryIds?: Set<string>
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
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
    <div className="divide-y divide-border">
      {groups.map((group) => {
        const dayCollapsed = isDayCollapsed(group.dateKey)
        const entryCount = group.taskGroups.reduce(
          (n, tg) => n + tg.entries.length,
          0,
        )
        return (
          <div key={group.dateKey}>
            {/* Day group header — static in day view, collapsible otherwise */}
            {view === 'day' ? (
              <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-bold text-foreground">
                    {group.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <LiveGroupTotal
                  completedSeconds={group.completedSeconds}
                  runningEntry={group.runningEntry}
                  formatTime={formatTime}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => toggleDayGroup(group.dateKey)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {dayCollapsed ? (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-bold text-foreground">
                    {group.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                    {group.taskGroups.length > 1 && (
                      <span className="ml-1 text-muted-foreground/60">
                        · {group.taskGroups.length} tasks
                      </span>
                    )}
                  </span>
                </div>
                <LiveGroupTotal
                  completedSeconds={group.completedSeconds}
                  runningEntry={group.runningEntry}
                  formatTime={formatTime}
                />
              </button>
            )}

            {/* Expanded day content — always visible in day view */}
            {(view === 'day' || !dayCollapsed) && (
              <>
                {/* Desktop table */}
                {isDesktop && (
                  <div className="hidden border-t border-border/40 sm:block">
                    <Table className="table-fixed">
                      <TableHeader className="bg-muted/60">
                        <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
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
                      <TableBody>
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
                                formatTime={formatTime}
                                hasActiveTimer={hasActiveTimer}
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
                                hasActiveTimer={hasActiveTimer}
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
                                    formatTime={formatTime}
                                    hasActiveTimer={hasActiveTimer}
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
                  <div className="grid gap-2 border-t border-border/40 p-3 sm:hidden">
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
                            formatTime={formatTime}
                            hasActiveTimer={hasActiveTimer}
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
                          className="grid gap-1.5"
                        >
                          <TaskGroupHeaderCard
                            group={taskGroup}
                            projects={projects}
                            tags={tags}
                            formatTime={formatTime}
                            hasActiveTimer={hasActiveTimer}
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
                                formatTime={formatTime}
                                hasActiveTimer={hasActiveTimer}
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
