import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  X,
} from 'lucide-react'
import type { Project, TimeEntry, ViewMode } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { EntriesFilters } from './EntriesFilters'
import { groupEntriesByDay } from './entries-grouping'
import { DayGroupsList } from './DayGroupEntries'
import type { BillableFilter, SortKey } from './hooks/useEntriesFilterSort'

const GROUPS_PER_PAGE = 10

function taskGroupCollapseKey(dateKey: string, groupKey: string) {
  return `${dateKey}::${groupKey}`
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
  projectTasks,
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
  projectTasks: Array<{ id: string; projectId: string; name: string }>
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
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {/* Section header */}
      <div className="border-b border-border p-3 sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
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
                    <ChevronsUpDown className="size-3" />
                    Expand all
                  </>
                ) : (
                  <>
                    <ChevronsDownUp className="size-3" />
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
                <X className="size-3" />
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
              <Filter className="size-3.5" />
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
      <DayGroupsList
        groups={visibleGroups}
        view={view}
        clients={clients}
        projects={projects}
        projectTasks={projectTasks}
        tags={tags}
        currency={currency}
        rateLookup={rateLookup}
        pending={pending}
        pendingEntryIds={pendingEntryIds}
        formatTime={formatTime}
        hasActiveTimer={hasActiveTimer}
        isDayCollapsed={(dateKey) => collapsedDates.has(dateKey)}
        toggleDayGroup={toggleDayGroup}
        isTaskGroupExpanded={isTaskGroupExpanded}
        toggleTaskGroup={toggleTaskGroup}
        onStartEdit={onStartEdit}
        onUpdate={onUpdate}
        onResume={onResume}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />

      {/* Load more days — not relevant in single-day view */}
      {hiddenGroupCount > 0 && view !== 'day' && (
        <div className="border-t border-border p-4 text-center">
          <button
            type="button"
            onClick={() => setVisibleGroupCount((c) => c + GROUPS_PER_PAGE)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <ChevronDown className="size-4" />
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
