import { Fragment, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { EntryCard } from './EntryCard'
import { EntryRow } from './EntryRow'
import type { BillableFilter, SortKey } from './hooks/useEntriesFilterSort'
import { useNowTick } from './hooks/useNowTick'
import { EntriesFilters } from './EntriesFilters'

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
      return {
        dateKey,
        label: formatDayLabel(dateKey),
        taskGroups: groupEntriesByTask(dayEntries),
        completedSeconds,
        runningEntry: running,
      }
    })
}

function DayGroupHeader({
  group,
  formatTime,
}: {
  group: DayGroup
  formatTime: (seconds: number) => string
}) {
  const tick = useNowTick(group.runningEntry ? 1000 : null)
  const runningSeconds = group.runningEntry
    ? getEntrySeconds(group.runningEntry, tick)
    : 0
  const total = group.completedSeconds + runningSeconds
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <p className="m-0 text-sm font-semibold text-foreground">{group.label}</p>
      <p className="m-0 text-xs font-mono text-muted-foreground">
        {formatTime(total)}
      </p>
    </div>
  )
}

export function AllEntriesSection({
  entries,
  totalCount,
  hasMore,
  loadingMore,
  onLoadMore,
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
  entries: TimeEntry[]
  totalCount: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
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
  clients: ClientItem[]
  projects: Project[]
  tags: Array<{ id: string; name: string; color: string }>
  currency: string
  rateLookup: (memberId: string) => number
  pending: boolean
  pendingEntryIds?: Set<string>
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
  onStartEdit: (entry: TimeEntry) => void
  onUpdate: (entryId: string, patch: InlinePatch) => void
  onResume: (entry: TimeEntry) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [showFilters, setShowFilters] = useState(false)
  const groups = groupEntriesByDay(entries)

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {totalCount.toLocaleString()} total entr
            {totalCount === 1 ? 'y' : 'ies'}
          </span>
          {activeFilterCount > 0 && (
            <>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}{' '}
                active
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-destructive hover:underline"
              >
                Clear
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          {showFilters ? 'Hide filters' : 'Filters'}
        </button>
      </div>

      {showFilters && (
        <EntriesFilters projects={projects} tags={tags} {...filterControls} />
      )}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center text-sm text-muted-foreground">
          {activeFilterCount > 0
            ? 'No entries match your current filters.'
            : 'No entries found. Start tracking time to see them here.'}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <div
              key={group.dateKey}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <DayGroupHeader group={group} formatTime={formatTime} />

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
                      <TableHead className="px-4 py-2.5 w-[8%] text-center text-muted-foreground font-medium">
                        Billable
                      </TableHead>
                      <TableHead className="px-4 py-2.5 w-[10%] text-right text-muted-foreground font-medium">
                        Amount
                      </TableHead>
                      <TableHead className="px-4 py-2.5 w-[10%]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.taskGroups.map((taskGroup) => {
                      if (taskGroup.entries.length === 1) {
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
                            currency={currency}
                            rateLookup={rateLookup}
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
                          {taskGroup.entries.map((entry, i) => (
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
                              isSubEntry={i > 0}
                              currency={currency}
                              rateLookup={rateLookup}
                              onStartEdit={() => onStartEdit(entry)}
                              onUpdate={(patch) => onUpdate(entry.id, patch)}
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
                {group.taskGroups.flatMap((tg) =>
                  tg.entries.map((entry) => (
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
                  )),
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2 pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="gap-2"
          >
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loadingMore ? 'Loading…' : 'Load more entries'}
          </Button>
        </div>
      )}
    </div>
  )
}
