import type {
  ExportSortBy,
  ExportSortOrder,
} from '#/lib/time-tracker/export-sort'

const sortByOptions: { value: ExportSortBy; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'client', label: 'Client' },
  { value: 'tag', label: 'Tag' },
  { value: 'billable', label: 'Billable' },
]

const sortOrderOptions: { value: ExportSortOrder; label: string }[] = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
]

export function ExportSortControls({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: {
  sortBy: ExportSortBy
  sortOrder: ExportSortOrder
  onSortByChange: (value: ExportSortBy) => void
  onSortOrderChange: (value: ExportSortOrder) => void
}) {
  return (
    <div className="grid gap-3">
      <SegmentedButtonGroup
        label="Sort by"
        options={sortByOptions}
        value={sortBy}
        onChange={onSortByChange}
      />
      <SegmentedButtonGroup
        label="Direction"
        options={sortOrderOptions}
        value={sortOrder}
        onChange={onSortOrderChange}
      />
    </div>
  )
}

function SegmentedButtonGroup<TValue extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: TValue; label: string }[]
  value: TValue
  onChange: (value: TValue) => void
}) {
  const gridClass =
    options.length > 2 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'

  return (
    <div className="grid gap-1.5 text-xs font-semibold text-foreground">
      <span>{label}</span>
      <div
        className={`grid ${gridClass} gap-1 rounded-lg border border-border bg-background p-1`}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-8 rounded-md px-2 text-xs font-bold transition-colors ${
              value === option.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
