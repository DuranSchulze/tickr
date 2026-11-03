import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import { EntriesFilters } from './EntriesFilters'
import { EntriesDateRangeFilter } from './EntriesDateRangeFilter'
import type { EntriesDateRange } from './EntriesDateRangeFilter'

type FilterProps = ComponentProps<typeof EntriesFilters>
type Props = Pick<FilterProps, 'projects' | 'tags'> & {
  dateRange: EntriesDateRange | null
  onDateRangeChange: (range: EntriesDateRange | null) => void
  filterControls: Omit<FilterProps, 'projects' | 'tags'>
}

// Keep opening and editing state here so these interactions do not rerender
// the entries table. Catalog menus mount at most 50 searchable results.
export function EntriesFiltersDialog({
  projects,
  tags,
  dateRange,
  onDateRangeChange,
  filterControls,
}: Props) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState(dateRange)
  const [project, setProject] = useState(filterControls.filterProject)
  const [tag, setTag] = useState(filterControls.filterTag)
  const [billable, setBillable] = useState(filterControls.filterBillable)
  const [sort, setSort] = useState(filterControls.sortKey)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setRange(dateRange)
      setProject(filterControls.filterProject)
      setTag(filterControls.filterTag)
      setBillable(filterControls.filterBillable)
      setSort(filterControls.sortKey)
    }
    setOpen(nextOpen)
  }

  function apply() {
    if (
      range?.startDate !== dateRange?.startDate ||
      range?.endDate !== dateRange?.endDate
    ) {
      onDateRangeChange(range)
    }
    filterControls.setFilterProject(project)
    filterControls.setFilterTag(tag)
    filterControls.setFilterBillable(billable)
    filterControls.setSortKey(sort)
    setOpen(false)
  }

  function reset() {
    setRange(null)
    setProject('')
    setTag('')
    setBillable('all')
    setSort('newest')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          Filters
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Filter entries</DialogTitle>
          <DialogDescription>
            Choose which time entries to show and how to sort them.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="grid max-h-[calc(100dvh-15rem)] gap-5 overflow-y-auto">
            <div className="grid gap-2">
              <span className="text-xs font-semibold text-smoke">
                Date range
              </span>
              <EntriesDateRangeFilter range={range} onChange={setRange} />
            </div>
            <EntriesFilters
              projects={projects}
              tags={tags}
              filterProject={project}
              setFilterProject={setProject}
              filterTag={tag}
              setFilterTag={setTag}
              filterBillable={billable}
              setFilterBillable={setBillable}
              sortKey={sort}
              setSortKey={setSort}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={reset}>
            Reset filters
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
