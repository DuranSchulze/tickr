import { memo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AnalyticsTimeEntryRow } from '#/lib/server/tracker/analytics.server'
import { formatCurrency } from '#/lib/time-tracker/billing'

const PAGE_SIZE = 50

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function EntryMobileCard({
  entry,
  currency,
}: {
  entry: AnalyticsTimeEntryRow
  currency: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-semibold text-foreground">
            {entry.description || 'Untitled'}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {entry.memberName} · {entry.date}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="m-0 font-mono text-sm font-bold text-foreground">
            {formatDuration(entry.durationSeconds)}
          </p>
          {entry.billableAmount != null && (
            <p className="m-0 text-xs text-muted-foreground">
              {formatCurrency(entry.billableAmount, currency)}
            </p>
          )}
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

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {entry.tagNames.length > 0 ? (
          entry.tagNames.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
        {entry.billable && (
          <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            Billable
          </span>
        )}
      </div>
    </div>
  )
}

export const AnalyticsEntriesTable = memo(function AnalyticsEntriesTable({
  entries,
  entriesTotal,
  page,
  onPageChange,
  currency,
}: {
  entries: AnalyticsTimeEntryRow[]
  entriesTotal: number
  page: number
  onPageChange: (page: number) => void
  currency: string
}) {
  const totalPages = Math.max(1, Math.ceil(entriesTotal / PAGE_SIZE))

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="m-0 text-base font-bold text-foreground">
          Time entries
        </h2>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {entriesTotal.toLocaleString()} entr
          {entriesTotal === 1 ? 'y' : 'ies'} match your current filters
        </p>
      </div>

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
                currency={currency}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Date
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Member
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Project / Client
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tags
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Duration
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Amount
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Billable
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="transition-colors hover:bg-muted/20"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {entry.date}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground">
                      {entry.memberName}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.projectName ? (
                        <span className="text-xs font-medium text-foreground">
                          {entry.projectName}
                          {entry.clientName && (
                            <span className="ml-1 font-normal text-muted-foreground">
                              · {entry.clientName}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.tagNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {entry.tagNames.map((tag) => (
                            <span
                              key={tag}
                              className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground">
                      <div
                        className="max-w-[260px] truncate"
                        title={entry.description || undefined}
                      >
                        {entry.description || (
                          <span className="text-muted-foreground">
                            Untitled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-mono font-semibold text-foreground">
                      {formatDuration(entry.durationSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-mono text-foreground">
                      {entry.billableAmount != null ? (
                        formatCurrency(entry.billableAmount, currency)
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {entry.billable ? (
                        <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Billable
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
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
})
