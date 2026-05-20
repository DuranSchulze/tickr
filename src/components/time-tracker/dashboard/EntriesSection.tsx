import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  X,
} from 'lucide-react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { EntriesFilters } from './EntriesFilters'
import { EntryCard } from './EntryCard'
import { EntryRow } from './EntryRow'
import type { BillableFilter, SortKey } from './hooks/useEntriesFilterSort'
import { useNowTick } from './hooks/useNowTick'

const GROUPS_PER_PAGE = 10

type DayGroup = {
  dateKey: string
  label: string
  entries: TimeEntry[]
  completedSeconds: number
  runningEntry: TimeEntry | null
}

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
    .map(([dateKey, groupEntries]) => {
      const running = groupEntries.find((e) => !e.endedAt) ?? null
      const completedSeconds = groupEntries
        .filter((e) => !!e.endedAt)
        .reduce((sum, e) => sum + e.durationSeconds, 0)
      return {
        dateKey,
        label: formatDayLabel(dateKey),
        entries: [...groupEntries].sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        ),
        completedSeconds,
        runningEntry: running,
      }
    })
}

export function EntriesSection({
  range,
  baseFiltered,
  filteredEntries,
  activeFilterCount,
  clearFilters,
  filterControls,
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
  const [visibleGroupCount, setVisibleGroupCount] = useState(GROUPS_PER_PAGE)

  const groups = useMemo(
    () => groupEntriesByDay(filteredEntries),
    [filteredEntries],
  )

  const visibleGroups = groups.slice(0, visibleGroupCount)
  const hiddenGroupCount = groups.length - visibleGroupCount
  const allCollapsed =
    groups.length > 0 && groups.every((g) => collapsedDates.has(g.dateKey))

  function toggleGroup(dateKey: string) {
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

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      {/* Section header */}
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-foreground">Entries</h2>
            <p className="m-0 mt-1 text-sm text-muted-foreground">
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
            {groups.length > 1 && (
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
          const isCollapsed = collapsedDates.has(group.dateKey)
          return (
            <div key={group.dateKey}>
              {/* Day group header — clickable to expand/collapse */}
              <button
                type="button"
                onClick={() => toggleGroup(group.dateKey)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-bold text-foreground">
                    {group.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {group.entries.length}{' '}
                    {group.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <LiveGroupTotal
                  completedSeconds={group.completedSeconds}
                  runningEntry={group.runningEntry}
                  formatTime={formatTime}
                />
              </button>

              {/* Expanded content */}
              {!isCollapsed && (
                <>
                  {/* Desktop: table (sm+) */}
                  <div className="hidden overflow-x-auto border-t border-border/40 sm:block">
                    <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                      <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 w-full min-w-[180px]">
                            Task
                          </th>
                          <th className="px-4 py-2.5 w-40 min-w-[120px]">
                            Project
                          </th>
                          <th className="px-4 py-2.5 w-44 min-w-[130px]">
                            Tags
                          </th>
                          <th className="px-4 py-2.5 w-20 text-center">
                            Billable
                          </th>
                          <th className="px-4 py-2.5 w-48 min-w-[170px]">
                            Duration
                          </th>
                          <th className="px-4 py-2.5 w-24 shrink-0"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.entries.map((entry) => (
                          <EntryRow
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
                            onUpdate={(patch) => onUpdate(entry.id, patch)}
                            onResume={() => onResume(entry)}
                            onDuplicate={() => onDuplicate(entry.id)}
                            onDelete={() => onDelete(entry.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: cards (< sm) */}
                  <div className="grid gap-2 border-t border-border/40 p-3 sm:hidden">
                    {group.entries.map((entry) => (
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
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Load more days */}
      {hiddenGroupCount > 0 && (
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
