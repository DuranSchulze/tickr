import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import type { TrackerState } from '#/lib/time-tracker/types'

export type MembersFilters = {
  search: string
  role: string
  dept: string
  cohort: string
  status: string
}

type MembersFilterBarProps = {
  state: TrackerState
  filters: MembersFilters
  onFiltersChange: (filters: MembersFilters) => void
  hasActiveFilters: boolean
  onClear: () => void
}

export function MembersFilterBar({
  state,
  filters,
  onFiltersChange,
  hasActiveFilters,
  onClear,
}: MembersFilterBarProps) {
  const [staged, setStaged] = useState<MembersFilters>(filters)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Sync staged filters when the committed filters change externally,
  // e.g. browser back/forward, clearing from parent, or initial load.
  useEffect(() => {
    setStaged(filters)
  }, [filters])

  const cohortFilterOptions = useMemo(
    () =>
      state.cohorts.filter(
        (c) => !staged.dept || c.departmentId === staged.dept,
      ),
    [state.cohorts, staged.dept],
  )

  const isDirty = useMemo(() => {
    return (
      staged.search !== filters.search ||
      staged.role !== filters.role ||
      staged.dept !== filters.dept ||
      staged.cohort !== filters.cohort ||
      staged.status !== filters.status
    )
  }, [staged, filters])

  const commit = () => {
    // If the user picked a cohort that is no longer available for the staged
    // department, clear it automatically before searching.
    let cohortToCommit = staged.cohort
    if (staged.cohort && staged.dept) {
      const cohort = state.cohorts.find((c) => c.id === staged.cohort)
      if (cohort && cohort.departmentId !== staged.dept) {
        cohortToCommit = ''
      }
    }

    onFiltersChange({ ...staged, cohort: cohortToCommit })
  }

  const handleClear = () => {
    setStaged({
      search: '',
      role: '',
      dept: '',
      cohort: '',
      status: '',
    })
    onClear()
    searchInputRef.current?.focus()
  }

  const updateStaged = (updates: Partial<MembersFilters>) => {
    setStaged((prev) => {
      const next = { ...prev, ...updates }
      // When department changes, clear the cohort if it no longer belongs to
      // the new department so the UI never shows an invalid selection.
      if (updates.dept !== undefined && next.cohort) {
        const cohort = state.cohorts.find((c) => c.id === next.cohort)
        if (cohort && cohort.departmentId !== next.dept) {
          next.cohort = ''
        }
      }
      return next
    })
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        commit()
      }}
    >
      <div className="min-w-[180px] flex-1 max-w-xs">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={staged.search}
            onChange={(e) => updateStaged({ search: e.target.value })}
            placeholder="Search by name or email…"
            aria-label="Search by name or email"
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {staged.search && (
            <button
              type="button"
              onClick={() => {
                updateStaged({ search: '' })
                searchInputRef.current?.focus()
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search text"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <select
        value={staged.role}
        onChange={(e) => updateStaged({ role: e.target.value })}
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
        value={staged.dept}
        onChange={(e) => updateStaged({ dept: e.target.value })}
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
        value={staged.cohort}
        onChange={(e) => updateStaged({ cohort: e.target.value })}
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
        value={staged.status}
        onChange={(e) => updateStaged({ status: e.target.value })}
        className="h-9 min-w-[120px] rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="INVITED">Invited</option>
        <option value="DISABLED">Disabled</option>
      </select>

      <Button type="submit" size="default" className="h-9">
        <Search className="mr-1.5 size-4" />
        Search
      </Button>

      {(hasActiveFilters || isDirty) && (
        <button
          type="button"
          onClick={handleClear}
          className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Clear
        </button>
      )}
    </form>
  )
}
