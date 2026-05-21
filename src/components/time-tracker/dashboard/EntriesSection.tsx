import { Fragment, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  Play,
  X,
} from 'lucide-react'
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
import { EntriesFilters } from './EntriesFilters'
import { EntryCard } from './EntryCard'
import { EntryRow } from './EntryRow'
import type { BillableFilter, SortKey } from './hooks/useEntriesFilterSort'
import { useNowTick } from './hooks/useNowTick'

const GROUPS_PER_PAGE = 10

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskGroup = {
  key: string
  description: string
  projectId: string
  tagIds: string[]
  billable: boolean
  entries: TimeEntry[]
  totalSeconds: number
  runningEntry: TimeEntry | null
}

type DayGroup = {
  dateKey: string
  label: string
  taskGroups: TaskGroup[]
  completedSeconds: number
  runningEntry: TimeEntry | null
}

// ─── Grouping helpers ─────────────────────────────────────────────────────────

function taskGroupKey(entry: TimeEntry): string {
  return [
    entry.description.trim().toLowerCase(),
    entry.projectId,
    [...entry.tagIds].sort().join(','),
    String(entry.billable),
  ].join('|')
}

function groupEntriesByTask(entries: TimeEntry[]): TaskGroup[] {
  const map = new Map<string, TimeEntry[]>()
  for (const entry of entries) {
    const key = taskGroupKey(entry)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  return Array.from(map.entries()).map(([key, groupEntries]) => {
    const sorted = [...groupEntries].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    const first = sorted[0]
    const totalSeconds = sorted.reduce((sum, e) => sum + e.durationSeconds, 0)
    return {
      key,
      description: first.description,
      projectId: first.projectId,
      tagIds: first.tagIds,
      billable: first.billable,
      entries: sorted,
      totalSeconds,
      runningEntry: sorted.find((e) => !e.endedAt) ?? null,
    }
  })
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.getTime() === today.getTime()) return 'Today'
  if (date.getTime() === yesterday.getTime()) return 'Yesterday'

  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }
  if (date.getFullYear() !== today.getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString(undefined, opts)
}

function groupEntriesByDay(entries: TimeEntry[]): DayGroup[] {
  const map = new Map<string, TimeEntry[]>()
  for (const entry of entries) {
    const d = new Date(entry.startedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayEntries]) => {
      const running = dayEntries.find((e) => !e.endedAt) ?? null
      const completedSeconds = dayEntries
        .filter((e) => !!e.endedAt)
        .reduce((sum, e) => sum + e.durationSeconds, 0)
      const taskGroups = groupEntriesByTask(dayEntries)
      return {
        dateKey,
        label: formatDayLabel(dateKey),
        taskGroups,
        completedSeconds,
        runningEntry: running,
      }
    })
}

// ─── Live total (ticks when a timer is running) ───────────────────────────────

function LiveGroupTotal({
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
      <td className="px-4 py-3 w-[32%]">
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
      <td className="px-4 py-3 w-[22%]">
        {project ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate">{project.name}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Tags */}
      <td className="px-4 py-3 w-[18%]">
        <span className="text-xs text-muted-foreground">
          {group.tagIds.length} tag{group.tagIds.length !== 1 ? 's' : ''}
        </span>
      </td>

      {/* Billable */}
      <td className="px-4 py-3 w-[10%] text-center">
        {group.billable && (
          <span className="text-xs font-bold text-primary">$</span>
        )}
      </td>

      {/* Resume */}
      <td className="px-4 py-3 w-[18%]" onClick={(e) => e.stopPropagation()}>
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
            <Play className="h-3.5 w-3.5" />
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
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
          <Play className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EntriesSection({
  view,
  range,
  baseFiltered,
  filteredEntries,
  activeFilterCount,
  clearFilters,
  filterControls,
  clients,
  projects,
  tags,
  currency,
  rateLookup,
  pending,
  pendingEntryIds,
  formatTime,
  hasActiveTimer,
  onStartEdit,
  onUpdate,
  onResume,
  onDuplicate,
  onDelete,
}: {
  view?: ViewMode
  range: { start: Date; end: Date }
  baseFiltered: TimeEntry[]
  filteredEntries: TimeEntry[]
  activeFilterCount: number
  clearFilters: () => void
  filterControls: {
    filterProject: string
    setFilterProject: (v: string) => void
    filterTag: string
    setFilterTag: (v: string) => void
    filterBillable: BillableFilter
    setFilterBillable: (v: BillableFilter) => void
    sortKey: SortKey
    setSortKey: (v: SortKey) => void
  }
  clients: Array<{ id: string; name: string; clientStatus: string }>
  projects: Project[]
  tags: SearchableItem[]
  currency: string
  rateLookup: (memberId: string) => number
  pending: boolean
  pendingEntryIds?: Set<string>
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
  onStartEdit: (entry: TimeEntry) => void
  onUpdate: (
    entryId: string,
    patch: Partial<
      Pick<
        TimeEntry,
        | 'description'
        | 'billable'
        | 'projectId'
        | 'tagIds'
        | 'startedAt'
        | 'endedAt'
      >
    >,
  ) => void
  onResume: (entry: TimeEntry) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [showFilters, setShowFilters] = useState(false)
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(
    () => new Set(),
  )
  const [collapsedTaskGroups, setCollapsedTaskGroups] = useState<Set<string>>(
    () => new Set(),
  )
  const [visibleGroupCount, setVisibleGroupCount] = useState(GROUPS_PER_PAGE)

  const groups = useMemo(
    () => groupEntriesByDay(filteredEntries),
    [filteredEntries],
  )
  const visibleGroups = groups.slice(0, visibleGroupCount)
  const hiddenGroupCount = groups.length - visibleGroupCount
  const allCollapsed =
    groups.length > 0 && groups.every((g) => collapsedDates.has(g.dateKey))

  function toggleDayGroup(dateKey: string) {
    setCollapsedDates((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
  }

  function toggleAll() {
    if (allCollapsed) {
      setCollapsedDates(new Set())
    } else {
      setCollapsedDates(new Set(groups.map((g) => g.dateKey)))
    }
  }

  function taskGroupCollapseKey(dateKey: string, groupKey: string) {
    return `${dateKey}::${groupKey}`
  }

  function toggleTaskGroup(dateKey: string, groupKey: string) {
    const key = taskGroupCollapseKey(dateKey, groupKey)
    setCollapsedTaskGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function isTaskGroupExpanded(dateKey: string, groupKey: string) {
    return !collapsedTaskGroups.has(taskGroupCollapseKey(dateKey, groupKey))
  }

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      {/* Section header */}
      <div className="border-b border-border p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-base sm:text-lg font-bold text-foreground">
              Entries
            </h2>
            <p className="m-0 mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground truncate sm:whitespace-normal">
              {range.start.toLocaleDateString()} –{' '}
              {new Date(range.end.getTime() - 1).toLocaleDateString()}
              {filteredEntries.length !== baseFiltered.length && (
                <span className="ml-2 font-semibold text-primary">
                  {filteredEntries.length} of {baseFiltered.length} shown
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {groups.length > 1 && view !== 'day' && (
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
              >
                {allCollapsed ? (
                  <>
                    <ChevronsUpDown className="h-3 w-3" />
                    Expand all
                  </>
                ) : (
                  <>
                    <ChevronsDownUp className="h-3 w-3" />
                    Collapse all
                  </>
                )}
              </button>
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <X className="h-3 w-3" />
                Clear ({activeFilterCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFilters((p) => !p)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground hover:bg-accent'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filter / Sort
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-card px-1.5 text-xs font-bold text-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {showFilters && (
          <EntriesFilters projects={projects} tags={tags} {...filterControls} />
        )}
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {baseFiltered.length === 0
            ? 'No entries in this period yet.'
            : 'No entries match your filters.'}
        </p>
      )}

      {/* Day groups */}
      <div className="divide-y divide-border">
        {visibleGroups.map((group) => {
          const isDayCollapsed = collapsedDates.has(group.dateKey)
          return (
            <div key={group.dateKey}>
              {/* Day group header — static in day view, collapsible in week/month */}
              {view === 'day' ? (
                <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-bold text-foreground">
                      {group.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.taskGroups.reduce(
                        (n, tg) => n + tg.entries.length,
                        0,
                      )}{' '}
                      {group.taskGroups.reduce(
                        (n, tg) => n + tg.entries.length,
                        0,
                      ) === 1
                        ? 'entry'
                        : 'entries'}
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
                    {isDayCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-sm font-bold text-foreground">
                      {group.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.taskGroups.reduce(
                        (n, tg) => n + tg.entries.length,
                        0,
                      )}{' '}
                      {group.taskGroups.reduce(
                        (n, tg) => n + tg.entries.length,
                        0,
                      ) === 1
                        ? 'entry'
                        : 'entries'}
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
              {(view === 'day' || !isDayCollapsed) && (
                <>
                  {/* Desktop table */}
                  <div className="hidden border-t border-border/40 sm:block">
                    <Table>
                      <TableHeader className="bg-muted/60">
                        <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
                          <TableHead className="px-4 py-2.5 w-[32%] text-muted-foreground font-medium">
                            Task
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[22%] text-muted-foreground font-medium">
                            Client / Project
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[18%] text-muted-foreground font-medium">
                            Tags
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[10%] text-center text-muted-foreground font-medium">
                            Billable
                          </TableHead>
                          <TableHead className="px-4 py-2.5 w-[18%]" />
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
                                tags={tags}
                                pending={pending}
                                isPending={pendingEntryIds?.has(entry.id)}
                                formatTime={formatTime}
                                hasActiveTimer={hasActiveTimer}
                                onStartEdit={() => onStartEdit(entry)}
                                onUpdate={(patch) => onUpdate(entry.id, patch)}
                                onResume={() => onResume(entry)}
                                onDuplicate={() => onDuplicate(entry.id)}
                                onDelete={() => onDelete(entry.id)}
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
                                onResume={() => onResume(taskGroup.entries[0])}
                              />
                              {expanded &&
                                taskGroup.entries.map((entry) => (
                                  <EntryRow
                                    key={entry.id}
                                    entry={entry}
                                    clients={clients}
                                    projects={projects}
                                    tags={tags}
                                    pending={pending}
                                    isPending={pendingEntryIds?.has(entry.id)}
                                    formatTime={formatTime}
                                    hasActiveTimer={hasActiveTimer}
                                    isSubEntry
                                    onStartEdit={() => onStartEdit(entry)}
                                    onUpdate={(patch) =>
                                      onUpdate(entry.id, patch)
                                    }
                                    onResume={() => onResume(entry)}
                                    onDuplicate={() => onDuplicate(entry.id)}
                                    onDelete={() => onDelete(entry.id)}
                                  />
                                ))}
                            </Fragment>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile cards */}
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
                            onStartEdit={() => onStartEdit(entry)}
                            onResume={() => onResume(entry)}
                            onDuplicate={() => onDuplicate(entry.id)}
                            onDelete={() => onDelete(entry.id)}
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
                            onResume={() => onResume(taskGroup.entries[0])}
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
                                onStartEdit={() => onStartEdit(entry)}
                                onResume={() => onResume(entry)}
                                onDuplicate={() => onDuplicate(entry.id)}
                                onDelete={() => onDelete(entry.id)}
                              />
                            ))}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Load more days — not relevant in single-day view */}
      {hiddenGroupCount > 0 && view !== 'day' && (
        <div className="border-t border-border p-4 text-center">
          <button
            type="button"
            onClick={() => setVisibleGroupCount((c) => c + GROUPS_PER_PAGE)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <ChevronDown className="h-4 w-4" />
            Show {Math.min(GROUPS_PER_PAGE, hiddenGroupCount)} more{' '}
            {Math.min(GROUPS_PER_PAGE, hiddenGroupCount) === 1 ? 'day' : 'days'}
            <span className="text-xs text-muted-foreground">
              ({hiddenGroupCount} remaining)
            </span>
          </button>
        </div>
      )}
    </section>
  )
}
