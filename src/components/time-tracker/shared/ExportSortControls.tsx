import {
  CalendarDays,
  DollarSign,
  SortAsc,
  SortDesc,
  Tag,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  ExportSortBy,
  ExportSortOrder,
} from '#/lib/time-tracker/export-sort'

type SegmentedOption<TValue extends string> = {
  value: TValue
  label: string
  icon: LucideIcon
}

const sortByOptions: SegmentedOption<ExportSortBy>[] = [
  { value: 'date', label: 'Date', icon: CalendarDays },
  { value: 'client', label: 'Client', icon: UserRound },
  { value: 'tag', label: 'Tag', icon: Tag },
  { value: 'billable', label: 'Billable', icon: DollarSign },
]

const sortOrderOptions: SegmentedOption<ExportSortOrder>[] = [
  { value: 'asc', label: 'Ascending', icon: SortAsc },
  { value: 'desc', label: 'Descending', icon: SortDesc },
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
  options: SegmentedOption<TValue>[]
  value: TValue
  onChange: (value: TValue) => void
}) {
  return (
    <div className="grid gap-1.5 text-xs font-semibold text-foreground">
      <span>{label}</span>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1">
        {options.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-bold transition-colors ${
                value === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
