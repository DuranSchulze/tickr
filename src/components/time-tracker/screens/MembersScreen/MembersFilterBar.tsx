import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { TrackerState } from '#/lib/time-tracker/types'

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
  const [localSearch, setLocalSearch] = useState(search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync localSearch when the committed value is cleared from outside (e.g. Clear button).
  useEffect(() => {
    if (search === '') setLocalSearch('')
  }, [search])

  function handleSearchInput(value: string) {
    setLocalSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSearchChange(value)
    }, 300)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <div className="relative min-w-[180px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search by name or email…"
          value={localSearch}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>
      <select
        value={filterRole}
        onChange={(e) => onFilterRoleChange(e.target.value)}
        className="h-9 min-w-[120px] rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
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
        className="h-9 min-w-[120px] rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
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
        className="h-9 min-w-[120px] rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
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
        className="h-9 min-w-[120px] rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
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
