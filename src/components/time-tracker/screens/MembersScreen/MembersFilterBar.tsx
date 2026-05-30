import type { TrackerState } from '#/lib/time-tracker/types'
import { CatalogSearchBar } from '#/components/time-tracker/catalogs/CatalogTableLayout'

export function MembersFilterBar({
  state,
  search,
  onSearchChange,
  filterRole,
  onFilterRoleChange,
  filterDept,
  onFilterDeptChange,
  filterCohort,
  onFilterCohortChange,
  filterStatus,
  onFilterStatusChange,
  cohortFilterOptions,
  hasActiveFilters,
  onClear,
}: {
  state: TrackerState
  search: string
  onSearchChange: (value: string) => void
  filterRole: string
  onFilterRoleChange: (value: string) => void
  filterDept: string
  onFilterDeptChange: (value: string) => void
  filterCohort: string
  onFilterCohortChange: (value: string) => void
  filterStatus: string
  onFilterStatusChange: (value: string) => void
  cohortFilterOptions: TrackerState['cohorts']
  hasActiveFilters: boolean
  onClear: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="min-w-[180px] flex-1 max-w-xs">
        <CatalogSearchBar
          value={search}
          onChange={onSearchChange}
          placeholder="Search by name or email…"
        />
      </div>
      <select
        value={filterRole}
        onChange={(e) => onFilterRoleChange(e.target.value)}
        className="h-9 min-w-[120px] rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">All roles</option>
        {state.roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <select
        value={filterDept}
        onChange={(e) => onFilterDeptChange(e.target.value)}
        className="h-9 min-w-[120px] rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">All departments</option>
        {state.departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select
        value={filterCohort}
        onChange={(e) => onFilterCohortChange(e.target.value)}
        className="h-9 min-w-[120px] rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">All cohorts</option>
        {cohortFilterOptions.map((cohort) => (
          <option key={cohort.id} value={cohort.id}>
            {cohort.name}
          </option>
        ))}
      </select>
      <select
        value={filterStatus}
        onChange={(e) => onFilterStatusChange(e.target.value)}
        className="h-9 min-w-[120px] rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="INVITED">Invited</option>
        <option value="DISABLED">Disabled</option>
      </select>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  )
}
