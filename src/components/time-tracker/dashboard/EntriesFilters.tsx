import { useId, useMemo } from 'react'
import { Combobox } from '#/components/ui/combobox'
import { ArrowDownUp } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import type { BillableFilter, SortKey } from './hooks/useEntriesFilterSort'

export function EntriesFilters({
  projects,
  tags,
  filterProject,
  setFilterProject,
  filterTag,
  setFilterTag,
  filterBillable,
  setFilterBillable,
  sortKey,
  setSortKey,
}: {
  projects: SearchableItem[]
  tags: SearchableItem[]
  filterProject: string
  setFilterProject: (v: string) => void
  filterTag: string
  setFilterTag: (v: string) => void
  filterBillable: BillableFilter
  setFilterBillable: (v: BillableFilter) => void
  sortKey: SortKey
  setSortKey: (v: SortKey) => void
}) {
  const id = useId()
  const triggerClassName =
    'w-full min-w-0 justify-between text-foreground [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:truncate'
  const contentClassName =
    'max-h-72 w-(--radix-select-trigger-width) max-w-[calc(100vw-2rem)] p-1'

  const projectOptions = useMemo(
    () => [
      { value: '', label: 'All projects' },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
    [projects],
  )
  const tagOptions = useMemo(
    () => [
      { value: '', label: 'All tags' },
      ...tags.map((tag) => ({ value: tag.id, label: tag.name })),
    ],
    [tags],
  )

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div
        role="group"
        aria-labelledby={`${id}-project-label`}
        className="grid min-w-0 gap-1.5"
      >
        <span
          id={`${id}-project-label`}
          className="text-xs font-semibold text-smoke"
        >
          Project
        </span>
        <Combobox
          options={projectOptions}
          value={filterProject}
          onValueChange={setFilterProject}
          searchPlaceholder="Search projects…"
          maxVisibleOptions={50}
          className="h-9"
        />
      </div>
      <div
        role="group"
        aria-labelledby={`${id}-tag-label`}
        className="grid min-w-0 gap-1.5"
      >
        <span
          id={`${id}-tag-label`}
          className="text-xs font-semibold text-smoke"
        >
          Tag
        </span>
        <Combobox
          options={tagOptions}
          value={filterTag}
          onValueChange={setFilterTag}
          searchPlaceholder="Search tags…"
          maxVisibleOptions={50}
          className="h-9"
        />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label
          htmlFor={`${id}-billable`}
          className="text-xs font-semibold text-smoke"
        >
          Billable
        </label>
        <Select
          value={filterBillable}
          onValueChange={(value) => setFilterBillable(value as BillableFilter)}
        >
          <SelectTrigger id={`${id}-billable`} className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            className={contentClassName}
          >
            <SelectItem value="all">All entries</SelectItem>
            <SelectItem value="yes">Billable only</SelectItem>
            <SelectItem value="no">Non-billable only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label
          htmlFor={`${id}-sort`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-smoke"
        >
          <ArrowDownUp aria-hidden="true" className="size-3" />
          Sort by
        </label>
        <Select
          value={sortKey}
          onValueChange={(value) => setSortKey(value as SortKey)}
        >
          <SelectTrigger id={`${id}-sort`} className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            className={contentClassName}
          >
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="longest">Longest first</SelectItem>
            <SelectItem value="shortest">Shortest first</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
