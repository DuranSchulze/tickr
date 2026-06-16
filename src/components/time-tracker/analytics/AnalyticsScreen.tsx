import { AlertTriangle, BarChart3 } from 'lucide-react'
import { formatCurrency } from '#/lib/time-tracker/billing'
import type { AnalyticsPayload } from '#/lib/server/tracker/analytics.server'
import type { TrackerState } from '#/lib/time-tracker/types'
import { MemberExportButton } from '#/components/time-tracker/shared/MemberExportDialog'
import { BulkExportButton } from '#/components/time-tracker/shared/BulkExportDialog'
import { AnalyticsDateRange } from './AnalyticsDateRange'
import { AnalyticsEntriesTable } from './AnalyticsEntriesTable'
import type { AnalyticsFilters } from './AnalyticsFilterBar'
import { AnalyticsFilterBar } from './AnalyticsFilterBar'
import { AnalyticsHeatmap } from './AnalyticsHeatmap'
import { AnalyticsSummaryCards } from './AnalyticsSummaryCards'
import type { AnalyticsQuery, AnalyticsScopeSearch } from './analytics.utils'
import { formatRange } from './analytics.utils'
import { useCallback, useEffect, useState } from 'react'

type AnalyticsChartsComponent = (props: {
  analytics: AnalyticsPayload
}) => React.ReactNode

const copyByScope = {
  workspace: {
    eyebrow: 'Workspace analytics',
    title: 'Organization activity',
    description: 'A clean view of completed tracked work across the workspace.',
  },
  department: {
    eyebrow: 'Department analytics',
    title: 'Department activity',
    description: 'Completed tracked work for members in your department.',
  },
  personal: {
    eyebrow: 'Personal analytics',
    title: 'Your time activity',
    description: 'A focused view of your completed tracked work.',
  },
} as const

const scopeLabels: Record<AnalyticsScopeSearch, string> = {
  personal: 'My analytics',
  organization: 'Organization',
  department: 'Department',
}

export function AnalyticsScreen({
  analytics,
  state,
  currentFilters,
  onChangeQuery,
}: {
  analytics: AnalyticsPayload
  state: TrackerState
  currentFilters: AnalyticsFilters
  onChangeQuery: (updates: Partial<AnalyticsQuery & AnalyticsFilters>) => void
}) {
  const copy = copyByScope[analytics.scope]
  const currentQuery = {
    startDate: analytics.startDate,
    endDate: analytics.endDate,
    scope: analytics.selectedScope,
  }

  const page = currentFilters.page ?? 1

  // When exactly one member is selected, offer a per-member PDF report scoped
  // to the current analytics date range.
  const selectedMemberIds = (currentFilters.memberIds ?? '')
    .split(',')
    .filter(Boolean)
  const singleSelectedMemberId =
    selectedMemberIds.length === 1 ? selectedMemberIds[0] : null

  const handleFilterChange = useCallback(
    (updates: Partial<AnalyticsFilters>) => onChangeQuery(updates),
    [onChangeQuery],
  )

  const handleClearFilters = useCallback(
    () =>
      onChangeQuery({
        projectId: undefined,
        clientId: undefined,
        tagIds: undefined,
        memberIds: undefined,
        billable: undefined,
        page: undefined,
      }),
    [onChangeQuery],
  )

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5">
      {/* Header */}
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              <BarChart3 className="size-3.5" />
              {copy.eyebrow}
            </div>
            <h1 className="m-0 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              {copy.title}
            </h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {copy.description}
            </p>
            <p className="m-0 mt-3 text-sm font-bold text-foreground">
              {analytics.scopeLabel} ·{' '}
              {formatRange(analytics.startDate, analytics.endDate)}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-start xl:items-end">
            {analytics.availableScopes.length > 1 && (
              <div className="no-print flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1">
                {analytics.availableScopes.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => onChangeQuery({ ...currentQuery, scope })}
                    className={`h-9 rounded-md px-2.5 text-sm font-bold transition-colors sm:px-3 ${
                      analytics.selectedScope === scope
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {scopeLabels[scope]}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <AnalyticsDateRange
                range={{
                  startDate: analytics.startDate,
                  endDate: analytics.endDate,
                }}
                onChangeRange={(range) =>
                  onChangeQuery({ ...range, scope: analytics.selectedScope })
                }
              />
              {singleSelectedMemberId && (
                <MemberExportButton
                  memberId={singleSelectedMemberId}
                  defaultStartDate={analytics.startDate}
                  defaultEndDate={analytics.endDate}
                />
              )}
              <BulkExportButton
                state={state}
                defaultStartDate={analytics.startDate}
                defaultEndDate={analytics.endDate}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <div className="no-print">
        <AnalyticsFilterBar
          state={state}
          filters={currentFilters}
          selectedScope={analytics.selectedScope}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
        />
      </div>

      {analytics.notice && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="m-0">{analytics.notice}</p>
        </div>
      )}

      {/* Heatmap — first data section */}
      <AnalyticsHeatmap
        heatmap={analytics.heatmap}
        projectTotals={analytics.projectTotals}
        topTasks={analytics.topTasks}
        topTags={analytics.topTags}
        topDepartments={analytics.topDepartments}
        selectedScope={analytics.selectedScope}
      />

      {/* Summary cards */}
      <AnalyticsSummaryCards summary={analytics.summary} />

      {/* Charts */}
      <ClientAnalyticsCharts analytics={analytics} />

      {/* Raw entries table */}
      <AnalyticsEntriesTable
        entries={analytics.entries}
        entriesTotal={analytics.entriesTotal}
        page={page}
        onPageChange={(p) => onChangeQuery({ page: p })}
        currency={analytics.currency}
      />

      {/* ── Print-only table ────────────────────────────────────────── */}
      <div className="hidden print:block">
        <div className="mb-4 text-center">
          <h2 className="m-0 text-lg font-bold">
            {analytics.scopeLabel}: Time Entries
          </h2>
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            {formatRange(analytics.startDate, analytics.endDate)} ·{' '}
            {analytics.entriesTotal} entr
            {analytics.entriesTotal === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 text-left font-bold">Date</th>
              <th className="px-2 py-1.5 text-left font-bold">Member</th>
              <th className="px-2 py-1.5 text-left font-bold">Project</th>
              <th className="px-2 py-1.5 text-left font-bold">Client</th>
              <th className="px-2 py-1.5 text-left font-bold">Tags</th>
              <th className="px-2 py-1.5 text-left font-bold">Description</th>
              <th className="px-2 py-1.5 text-right font-bold">Hours</th>
              <th className="px-2 py-1.5 text-right font-bold">Rate/hr</th>
              <th className="px-2 py-1.5 text-right font-bold">Amount</th>
              <th className="px-2 py-1.5 text-center font-bold">Billable</th>
            </tr>
          </thead>
          <tbody>
            {analytics.entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border/50">
                <td className="px-2 py-1.5 whitespace-nowrap">{entry.date}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {entry.memberName}
                </td>
                <td className="px-2 py-1.5">{entry.projectName ?? '—'}</td>
                <td className="px-2 py-1.5">{entry.clientName ?? '—'}</td>
                <td className="px-2 py-1.5">
                  {entry.tagNames.join(', ') || '—'}
                </td>
                <td className="px-2 py-1.5">
                  <div
                    className="max-w-[300px] truncate"
                    title={entry.description || undefined}
                  >
                    {entry.description || '—'}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {formatDuration(entry.durationSeconds)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {entry.billable && entry.effectiveRate != null
                    ? formatCurrency(entry.effectiveRate, analytics.currency)
                    : '—'}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {entry.billable && entry.billableAmount != null
                    ? formatCurrency(entry.billableAmount, analytics.currency)
                    : '—'}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {entry.billable ? 'Yes' : 'No'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {analytics.entries.length === 0 && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No entries match your current filters
          </p>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

function ClientAnalyticsCharts({
  analytics,
}: {
  analytics: AnalyticsPayload
}): React.ReactNode {
  const [Charts, setCharts] = useState<AnalyticsChartsComponent | null>(null)

  useEffect(() => {
    let mounted = true
    import('./AnalyticsCharts').then((module) => {
      if (mounted) setCharts(() => module.AnalyticsCharts)
    })
    return () => {
      mounted = false
    }
  }, [])

  if (!Charts) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-[320px] rounded-lg border border-border bg-card" />
        <div className="h-[320px] rounded-lg border border-border bg-card" />
      </div>
    )
  }

  return <Charts analytics={analytics} />
}
