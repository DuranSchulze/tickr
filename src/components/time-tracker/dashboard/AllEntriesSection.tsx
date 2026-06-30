import { useMemo, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Loader2 } from 'lucide-react'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { Button } from '#/components/ui/button'
import { groupEntriesByDay } from './entries-grouping'
import { DayGroupsList } from './DayGroupEntries'
import type { BillableFilter, SortKey } from './hooks/useEntriesFilterSort'
import { EntriesFilters } from './EntriesFilters'
import { EntriesDateRangeFilter } from './EntriesDateRangeFilter'
import type { EntriesDateRange } from './EntriesDateRangeFilter'

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

function taskGroupCollapseKey(dateKey: string, groupKey: string) {
  return `${dateKey}::${groupKey}`
}

export function AllEntriesSection({
  entries,
  totalCount,
  hasMore,
  loadingMore,
  onLoadMore,
  dateRange,
  onDateRangeChange,
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
  deletingEntryId,
  formatTime,
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
  dateRange: EntriesDateRange | null
  onDateRangeChange: (range: EntriesDateRange | null) => void
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
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: SearchableItem[]
  currency: string
  rateLookup: (memberId: string) => number
  pending: boolean
  pendingEntryIds?: Set<string>
  deletingEntryId?: string | null
  formatTime: (seconds: number) => string
  onStartEdit: (entry: TimeEntry) => void
  onUpdate: (entryId: string, patch: InlinePatch) => void
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

  const groups = useMemo(() => groupEntriesByDay(entries), [entries])
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
    <section className="min-w-0">
      {/* Section header */}
      <div className="px-1 pb-3 sm:px-0 sm:pb-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <h2 className="m-0 text-base font-bold text-foreground sm:text-lg">
              Entries
            </h2>
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {totalCount.toLocaleString()} total entr
              {totalCount === 1 ? 'y' : 'ies'}
            </span>
            {activeFilterCount > 0 && (
              <>
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
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

          <div className="flex flex-wrap items-center gap-2">
            {groups.length > 1 && (
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
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {showFilters ? 'Hide filters' : 'Filters'}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 grid gap-3 rounded-lg border border-border bg-muted p-3">
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Date range
              </span>
              <EntriesDateRangeFilter
                range={dateRange}
                onChange={onDateRangeChange}
              />
            </div>
            <EntriesFilters
              projects={projects}
              tags={tags}
              {...filterControls}
            />
          </div>
        )}
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {activeFilterCount > 0
            ? 'No entries match your current filters.'
            : 'No entries found. Start tracking time to see them here.'}
        </p>
      )}

      {/* Day groups */}
      <DayGroupsList
        groups={groups}
        view="all"
        clients={clients}
        projects={projects}
        projectTasks={projectTasks}
        tags={tags}
        currency={currency}
        rateLookup={rateLookup}
        pending={pending}
        pendingEntryIds={pendingEntryIds}
        deletingEntryId={deletingEntryId}
        formatTime={formatTime}
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

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center border-t border-border py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="gap-2"
          >
            {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
            {loadingMore ? 'Loading…' : 'Load more entries'}
          </Button>
        </div>
      )}
    </section>
  )
}
