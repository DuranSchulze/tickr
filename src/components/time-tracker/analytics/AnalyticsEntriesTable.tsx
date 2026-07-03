import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import type { AnalyticsTimeEntryRow } from '#/lib/server/tracker/analytics.server'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'

const pageSizeOptions = [25, 50, 100] as const

function getDisplaySeconds(entry: AnalyticsTimeEntryRow): number {
  if (!entry.endedAt) return entry.durationSeconds
  const startedAt = new Date(entry.startedAt).getTime()
  const endedAt = new Date(entry.endedAt).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return entry.durationSeconds
  }
  return Math.max(0, (endedAt - startedAt) / 1000)
}

function formatTimeRange(
  entry: AnalyticsTimeEntryRow,
  timezone: string,
): string {
  const format = (value: string) =>
    new Date(value).toLocaleTimeString([], {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    })
  return `${format(entry.startedAt)} – ${
    entry.endedAt ? format(entry.endedAt) : 'Now'
  }`
}

function EntryMobileCard({
  entry,
  onEditEntry,
  onDeleteEntry,
  bulkSelected,
  onToggleBulkSelected,
  formatTime,
  timezone,
}: {
  entry: AnalyticsTimeEntryRow
  onEditEntry?: (entry: AnalyticsTimeEntryRow) => void
  onDeleteEntry?: (entry: AnalyticsTimeEntryRow) => void
  bulkSelected?: boolean
  onToggleBulkSelected?: (entry: AnalyticsTimeEntryRow) => void
  formatTime: (seconds: number) => string
  timezone: string
}) {
  const displaySeconds = getDisplaySeconds(entry)
  const hasActions = onEditEntry || onDeleteEntry
  const hasBulkSelect = !!onToggleBulkSelected

  return (
    <div
      className={`min-w-0 rounded-lg border bg-background p-3 ${
        bulkSelected ? 'border-primary/50' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {hasBulkSelect && (
            <input
              type="checkbox"
              checked={!!bulkSelected}
              onChange={() => onToggleBulkSelected(entry)}
              aria-label={`Select entry ${entry.description || entry.date}`}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
          )}
          <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-semibold text-foreground">
            {entry.description || 'Untitled'}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {entry.memberName} · {entry.date}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {formatTimeRange(entry, timezone)}
          </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="m-0 font-mono text-sm font-bold text-foreground">
            {formatTime(displaySeconds)}
          </p>
        </div>
      </div>

      {(entry.projectName || entry.clientName) && (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {entry.projectName && (
            <span className="min-w-0 max-w-full truncate font-medium text-foreground">
              {entry.projectName}
            </span>
          )}
          {entry.clientName && <span>· {entry.clientName}</span>}
        </div>
      )}

      <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
        {entry.tagNames.length > 0 ? (
          entry.tagNames.map((tag) => (
            <span
              key={tag}
              className="inline-block shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
        {entry.billable && (
          <span className="inline-block shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            Billable
          </span>
        )}
      </div>

      {hasActions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onEditEntry && (
            <button
              type="button"
              onClick={() => onEditEntry(entry)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          )}
          {onDeleteEntry && (
            <button
              type="button"
              onClick={() => onDeleteEntry(entry)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-destructive/40 bg-background px-2.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function EntriesTableHeader({
  entriesTotal,
  pageSize,
  selectedVisibleCount,
  selectedEntries,
  onBulkDeleteEntries,
  onClearSelection,
  onPageSizeChange,
}: {
  entriesTotal: number
  pageSize: number
  selectedVisibleCount: number
  selectedEntries: AnalyticsTimeEntryRow[]
  onBulkDeleteEntries?: (entries: AnalyticsTimeEntryRow[]) => void
  onClearSelection: () => void
  onPageSizeChange?: (pageSize: number) => void
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="m-0 text-base font-bold text-foreground">
          Time entries
        </h2>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {entriesTotal.toLocaleString()} entr
          {entriesTotal === 1 ? 'y' : 'ies'} match your current filters
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onBulkDeleteEntries && selectedVisibleCount > 0 && (
          <>
            <span className="text-xs font-semibold text-muted-foreground">
              {selectedVisibleCount} selected
            </span>
            <button
              type="button"
              onClick={() => onBulkDeleteEntries(selectedEntries)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-destructive/40 bg-background px-2.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" />
              Delete selected
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Clear
            </button>
          </>
        )}

        {onPageSizeChange && (
          <label className="flex w-fit items-center gap-2 text-xs font-semibold text-muted-foreground">
            Rows
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

function DesktopEntriesTable({
  entries,
  timezone,
  formatTime,
  hasActions,
  hasBulkDelete,
  allVisibleSelected,
  selectedIds,
  onToggleAllVisible,
  onToggleEntrySelected,
  onEditEntry,
  onDeleteEntry,
}: {
  entries: AnalyticsTimeEntryRow[]
  timezone: string
  formatTime: (seconds: number) => string
  hasActions: boolean
  hasBulkDelete: boolean
  allVisibleSelected: boolean
  selectedIds: Set<string>
  onToggleAllVisible: () => void
  onToggleEntrySelected: (entry: AnalyticsTimeEntryRow) => void
  onEditEntry?: (entry: AnalyticsTimeEntryRow) => void
  onDeleteEntry?: (entry: AnalyticsTimeEntryRow) => void
}) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full min-w-[1040px] table-fixed text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {hasBulkDelete && (
              <th className="w-[44px] whitespace-nowrap px-4 py-2.5 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleAllVisible}
                  aria-label={
                    allVisibleSelected
                      ? 'Deselect all visible entries'
                      : 'Select all visible entries'
                  }
                  className="size-4 accent-primary"
                />
              </th>
            )}
            <th className="w-[92px] whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Date
            </th>
            <th className="w-[150px] whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Start – End
            </th>
            <th className="w-[150px] whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Member
            </th>
            <th className="w-[190px] whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Project / Client
            </th>
            <th className="w-[180px] whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tags
            </th>
            <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </th>
            <th className="w-[130px] whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Duration
            </th>
            <th className="w-[92px] whitespace-nowrap px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Billable
            </th>
            {hasActions && (
              <th className="w-[104px] whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <DesktopEntryRow
              key={entry.id}
              entry={entry}
              timezone={timezone}
              formatTime={formatTime}
              hasActions={hasActions}
              hasBulkDelete={hasBulkDelete}
              selected={selectedIds.has(entry.id)}
              onToggleSelected={() => onToggleEntrySelected(entry)}
              onEditEntry={onEditEntry}
              onDeleteEntry={onDeleteEntry}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DesktopEntryRow({
  entry,
  timezone,
  formatTime,
  hasActions,
  hasBulkDelete,
  selected,
  onToggleSelected,
  onEditEntry,
  onDeleteEntry,
}: {
  entry: AnalyticsTimeEntryRow
  timezone: string
  formatTime: (seconds: number) => string
  hasActions: boolean
  hasBulkDelete: boolean
  selected: boolean
  onToggleSelected: () => void
  onEditEntry?: (entry: AnalyticsTimeEntryRow) => void
  onDeleteEntry?: (entry: AnalyticsTimeEntryRow) => void
}) {
  return (
    <tr className="transition-colors hover:bg-muted/20">
      {hasBulkDelete && (
        <td className="whitespace-nowrap px-4 py-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select entry ${entry.description || entry.date}`}
            className="size-4 accent-primary"
          />
        </td>
      )}
      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
        {entry.date}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-foreground">
        {formatTimeRange(entry, timezone)}
      </td>
      <td className="px-4 py-2.5 text-xs font-medium text-foreground">
        <div className="truncate" title={entry.memberName}>
          {entry.memberName}
        </div>
      </td>
      <td className="px-4 py-2.5">
        {entry.projectName ? (
          <div
            className="truncate text-xs font-medium text-foreground"
            title={[entry.projectName, entry.clientName]
              .filter(Boolean)
              .join(' · ')}
          >
            {entry.projectName}
            {entry.clientName && (
              <span className="ml-1 font-normal text-muted-foreground">
                · {entry.clientName}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {entry.tagNames.length > 0 ? (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap pb-1">
            {entry.tagNames.map((tag) => (
              <span
                key={tag}
                className="inline-block shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-foreground">
        <div
          className="max-w-[260px] truncate"
          title={entry.description || undefined}
        >
          {entry.description || (
            <span className="text-muted-foreground">Untitled</span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-mono font-semibold text-foreground">
        {formatTime(getDisplaySeconds(entry))}
      </td>
      <td className="px-4 py-2.5 text-center">
        {entry.billable ? (
          <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            Billable
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
      {hasActions && (
        <td className="whitespace-nowrap px-4 py-2.5 text-right">
          <div className="inline-flex items-center justify-end gap-1.5">
            {onEditEntry && (
              <button
                type="button"
                onClick={() => onEditEntry(entry)}
                className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent"
                aria-label={`Edit entry ${entry.description || entry.date}`}
                title="Edit entry"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {onDeleteEntry && (
              <button
                type="button"
                onClick={() => onDeleteEntry(entry)}
                className="inline-flex size-8 items-center justify-center rounded-md border border-destructive/40 bg-background text-destructive transition-colors hover:bg-destructive/10"
                aria-label={`Delete entry ${entry.description || entry.date}`}
                title="Delete entry"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

export function AnalyticsEntriesTable({
  entries,
  entriesTotal,
  page,
  pageSize = 50,
  onPageChange,
  onPageSizeChange,
  timezone,
  onEditEntry,
  onDeleteEntry,
  onBulkDeleteEntries,
}: {
  entries: AnalyticsTimeEntryRow[]
  entriesTotal: number
  page: number
  pageSize?: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  timezone: string
  onEditEntry?: (entry: AnalyticsTimeEntryRow) => void
  onDeleteEntry?: (entry: AnalyticsTimeEntryRow) => void
  onBulkDeleteEntries?: (entries: AnalyticsTimeEntryRow[]) => void
}) {
  const { formatTime } = useTimeFormat()
  const hasActions = onEditEntry || onDeleteEntry
  const hasBulkDelete = !!onBulkDeleteEntries
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const visibleIds = useMemo(() => entries.map((entry) => entry.id), [entries])
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedIds.has(entry.id)),
    [entries, selectedIds],
  )
  const selectedVisibleCount = selectedEntries.length
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const totalPages = Math.max(1, Math.ceil(entriesTotal / pageSize))
  const firstEntry = entriesTotal === 0 ? 0 : (page - 1) * pageSize + 1
  const lastEntry = Math.min(
    entriesTotal,
    (page - 1) * pageSize + entries.length,
  )

  function toggleEntrySelected(entry: AnalyticsTimeEntryRow) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(entry.id)) next.delete(entry.id)
      else next.add(entry.id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id)
      } else {
        for (const id of visibleIds) next.add(id)
      }
      return next
    })
  }

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-sm">
      <EntriesTableHeader
        entriesTotal={entriesTotal}
        pageSize={pageSize}
        selectedVisibleCount={selectedVisibleCount}
        selectedEntries={selectedEntries}
        onBulkDeleteEntries={onBulkDeleteEntries}
        onClearSelection={() => setSelectedIds(new Set())}
        onPageSizeChange={onPageSizeChange}
      />

      {entries.length === 0 ? (
        <div className="flex items-center justify-center px-4 py-12 text-sm text-muted-foreground">
          No entries match your current filters
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="grid min-w-0 gap-3 p-3 lg:hidden">
            {entries.map((entry) => (
              <EntryMobileCard
                key={entry.id}
                entry={entry}
                onEditEntry={onEditEntry}
                onDeleteEntry={onDeleteEntry}
                bulkSelected={selectedIds.has(entry.id)}
                onToggleBulkSelected={
                  hasBulkDelete ? toggleEntrySelected : undefined
                }
                formatTime={formatTime}
                timezone={timezone}
              />
            ))}
          </div>

          <DesktopEntriesTable
            entries={entries}
            timezone={timezone}
            formatTime={formatTime}
            hasActions={!!hasActions}
            hasBulkDelete={hasBulkDelete}
            allVisibleSelected={allVisibleSelected}
            selectedIds={selectedIds}
            onToggleAllVisible={toggleAllVisible}
            onToggleEntrySelected={toggleEntrySelected}
            onEditEntry={onEditEntry}
            onDeleteEntry={onDeleteEntry}
          />
        </>
      )}

      {entriesTotal > 0 && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {firstEntry.toLocaleString()}-{lastEntry.toLocaleString()}{' '}
            of {entriesTotal.toLocaleString()} · Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
