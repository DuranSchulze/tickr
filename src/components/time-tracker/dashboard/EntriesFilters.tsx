import { ArrowDownUp } from 'lucide-react'
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
  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-border bg-muted p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Project
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="h-8 rounded border border-border bg-card text-foreground px-2 text-sm outline-none focus:border-primary"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Tag
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="h-8 rounded border border-border bg-card text-foreground px-2 text-sm outline-none focus:border-primary"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Billable
        <select
          value={filterBillable}
          onChange={(e) => setFilterBillable(e.target.value as BillableFilter)}
          className="h-8 rounded border border-border bg-card text-foreground px-2 text-sm outline-none focus:border-primary"
        >
          <option value="all">All entries</option>
          <option value="yes">Billable only</option>
          <option value="no">Non-billable only</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ArrowDownUp className="h-3 w-3" />
          Sort by
        </span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-8 rounded border border-border bg-card text-foreground px-2 text-sm outline-none focus:border-primary"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="longest">Longest first</option>
          <option value="shortest">Shortest first</option>
        </select>
      </label>
    </div>
  )
}
