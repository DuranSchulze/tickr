import type { ReportsPayload } from '#/lib/server/tracker/reports.server'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'

const pageSizeOptions = [25, 50, 100] as const

function buildPageNumbers(
  current: number,
  total: number,
): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis')[] = [1]

  if (current > 3) {
    pages.push('ellipsis')
  }

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let p = start; p <= end; p++) {
    pages.push(p)
  }

  if (current < total - 2) {
    pages.push('ellipsis')
  }

  pages.push(total)

  return pages
}

function formatTimeRange(
  entry: ReportsPayload['entries'][number],
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

export function ReportsEntriesTable({
  entries,
  entriesTotal,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  timezone,
}: {
  entries: ReportsPayload['entries']
  entriesTotal: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  timezone: string
}) {
  const totalPages = Math.max(1, Math.ceil(entriesTotal / pageSize))
  const pages = buildPageNumbers(page, totalPages)
  const { formatTime } = useTimeFormat()

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="m-0 text-sm font-semibold text-muted-foreground">
          No entries match your current filters
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="m-0 text-sm font-semibold text-foreground">
          {entriesTotal} {entriesTotal === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      {/* Mobile: stacked cards */}
      <div className="grid gap-3 p-3 lg:hidden">
        {entries.map((entry) => (
          <EntryMobileCard
            key={entry.id}
            entry={entry}
            timezone={timezone}
            formatTime={formatTime}
          />
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Date
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Time
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Member
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Project
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Client
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Description
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Tags
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Duration
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Billable
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-border/50 last:border-b-0 hover:bg-muted/30"
              >
                <td className="px-4 py-2.5 text-sm font-medium text-foreground whitespace-nowrap">
                  {entry.date}
                </td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatTimeRange(entry, timezone)}
                </td>
                <td className="px-4 py-2.5 text-sm text-foreground whitespace-nowrap">
                  {entry.memberName}
                </td>
                <td className="px-4 py-2.5 text-sm text-foreground">
                  {entry.projectName ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-sm text-foreground">
                  {entry.clientName ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-sm text-foreground">
                  <div
                    className="max-w-[250px] truncate"
                    title={entry.description || undefined}
                  >
                    {entry.description || '—'}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground">
                  {entry.tagNames.join(', ') || '—'}
                </td>
                <td className="px-4 py-2.5 text-sm text-foreground text-right tabular-nums whitespace-nowrap">
                  {formatTime(entry.durationSeconds)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {entry.billable ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Yes
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Show</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <nav className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {pages.map((p, i) =>
              p === 'ellipsis' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="inline-flex h-8 w-8 items-center justify-center text-xs text-muted-foreground"
                >
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-colors ${
                    p === page
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </nav>
        </div>
      )}
    </div>
  )
}

function EntryMobileCard({
  entry,
  timezone,
  formatTime,
}: {
  entry: ReportsPayload['entries'][number]
  timezone: string
  formatTime: (seconds: number) => string
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-bold text-foreground line-clamp-2">
            {entry.description || 'Untitled entry'}
          </p>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            {entry.memberName} · {entry.date} ·{' '}
            {formatTimeRange(entry, timezone)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="m-0 text-sm font-bold tabular-nums text-foreground">
            {formatTime(entry.durationSeconds)}
          </p>
          {entry.billable && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Billable
            </span>
          )}
        </div>
      </div>

      {(entry.projectName || entry.clientName) && (
        <p className="m-0 mt-2 text-xs text-muted-foreground">
          {[entry.clientName, entry.projectName].filter(Boolean).join(' › ')}
        </p>
      )}

      {entry.tagNames.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.tagNames.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
