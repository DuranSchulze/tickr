import type {
  ExportSortBy,
  ExportSortOrder,
} from '#/lib/time-tracker/export-sort'

type SortableReportEntry = {
  id: string
  startedAt: string
  clientName: string | null
  tagNames: string[]
  billable: boolean
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function valueForSort(entry: SortableReportEntry, sortBy: ExportSortBy) {
  if (sortBy === 'client') return entry.clientName ?? ''
  if (sortBy === 'tag') return entry.tagNames.join(', ')
  if (sortBy === 'billable') return entry.billable ? 1 : 0
  return entry.startedAt
}

function compareValues(
  a: SortableReportEntry,
  b: SortableReportEntry,
  sortBy: ExportSortBy,
) {
  const left = valueForSort(a, sortBy)
  const right = valueForSort(b, sortBy)

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return compareText(String(left), String(right))
}

export function sortReportEntries<TEntry extends SortableReportEntry>(
  entries: TEntry[],
  sortBy: ExportSortBy = 'date',
  sortOrder: ExportSortOrder = 'asc',
) {
  const direction = sortOrder === 'desc' ? -1 : 1

  entries.sort((a, b) => {
    const primary = compareValues(a, b, sortBy)
    if (primary !== 0) return primary * direction

    const byDate = compareText(a.startedAt, b.startedAt)
    if (byDate !== 0) return byDate

    return compareText(a.id, b.id)
  })
}
