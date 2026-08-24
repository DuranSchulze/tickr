import { Link } from '@tanstack/react-router'
import { AlertTriangle, BarChart3 } from 'lucide-react'
import { formatDecimalRate, formatMoney } from '#/lib/time-tracker/export-utils'
import { formatDurationDdhms } from '#/lib/time-tracker/store'
import type { AnalyticsPayload } from '#/lib/server/tracker/analytics.server'
import type { TrackerState } from '#/lib/time-tracker/types'
import { MemberExportButton } from '#/components/time-tracker/shared/MemberExportDialog'
import { BulkExportButton } from '#/components/time-tracker/shared/BulkExportDialog'
import { Button } from '#/components/ui/button'
import { AnalyticsDateRange } from './AnalyticsDateRange'
import { AnalyticsEntriesTable } from './AnalyticsEntriesTable'
import type { AnalyticsFilters } from './AnalyticsFilterBar'
import { AnalyticsFilterBar } from './AnalyticsFilterBar'
import { AnalyticsHeatmap } from './AnalyticsHeatmap'
import { AnalyticsSummaryCards } from './AnalyticsSummaryCards'
import type { AnalyticsQuery, AnalyticsScopeSearch } from './analytics.utils'
import { formatRange } from './analytics.utils'
import { useCallback, useEffect, useReducer, useState } from 'react'
import type { SetStateAction } from 'react'

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

type AnalyticsScreenProps = {
  analytics: AnalyticsPayload
  state: TrackerState
  currentFilters: AnalyticsFilters
  onChangeQuery: (updates: Partial<AnalyticsQuery & AnalyticsFilters>) => void
}

export function AnalyticsScreen(props: AnalyticsScreenProps) {
  const { currentFilters } = props
  const draftKey = [
    currentFilters.projectId,
    currentFilters.clientId,
    currentFilters.tagIds,
    currentFilters.memberIds,
    currentFilters.billable,
  ].join('|')

  return <AnalyticsScreenContent key={draftKey} {...props} />
}

function AnalyticsScreenContent({
  analytics,
  state,
  currentFilters,
  onChangeQuery,
}: AnalyticsScreenProps) {
  const copy = copyByScope[analytics.scope]
  const currentQuery = {
    startDate: analytics.startDate,
    endDate: analytics.endDate,
    scope: analytics.selectedScope,
  }

  const page = currentFilters.page ?? 1
  const pageSize = currentFilters.pageSize ?? 50

  // ── Draft filters: filter bar changes are staged until "Search" is clicked ──
  const [draftFilters, setDraftFilters] = useReducer(
    (
      current: AnalyticsFilters,
      action: SetStateAction<AnalyticsFilters>,
    ): AnalyticsFilters =>
      typeof action === 'function' ? action(current) : action,
    currentFilters,
  )

  // When exactly one member is selected, offer a per-member PDF report scoped
  // to the current analytics date range.
  const selectedMemberIds = (currentFilters.memberIds ?? '')
    .split(',')
    .filter(Boolean)
  const singleSelectedMemberId =
    selectedMemberIds.length === 1 ? selectedMemberIds[0] : null

  // Filter bar changes only update the draft — no navigation / re-fetch yet.
  const handleFilterChange = useCallback(
    (updates: Partial<AnalyticsFilters>) =>
      setDraftFilters((prev) => ({ ...prev, ...updates, page: undefined })),
    [],
  )

  // "Search" / "Apply" button: commit the draft filters to the URL, triggering
  // the loader re-fetch.
  const handleSearch = useCallback(
    () =>
      setDraftFilters((draft) => {
        onChangeQuery({
          projectId: draft.projectId,
          clientId: draft.clientId,
          tagIds: draft.tagIds,
          memberIds: draft.memberIds,
          billable: draft.billable,
        })
        return draft
      }),
    [onChangeQuery],
  )

  // "Clear filters" resets the draft AND applies immediately (definitive action).
  const handleClearFilters = useCallback(() => {
    const cleared: AnalyticsFilters = {
      projectId: undefined,
      clientId: undefined,
      tagIds: undefined,
      memberIds: undefined,
      billable: undefined,
      page: undefined,
    }
    setDraftFilters(cleared)
    onChangeQuery(cleared)
  }, [onChangeQuery])

  return (
    <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4 sm:gap-5">
      {/* Header */}
      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
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
            <p className="m-0 mt-3 text-sm font-bold leading-6 text-foreground">
              {analytics.scopeLabel} ·{' '}
              {formatRange(analytics.startDate, analytics.endDate)}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:items-start xl:items-end">
            {analytics.availableScopes.length > 1 && (
              <div className="no-print grid w-full grid-cols-1 gap-1 rounded-lg border border-border bg-background p-1 min-[420px]:grid-cols-3 sm:w-auto sm:flex sm:flex-wrap">
                {analytics.availableScopes.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() =>
                      onChangeQuery({ ...currentQuery, scope, page: undefined })
                    }
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

            <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-start xl:justify-end">
              <AnalyticsDateRange
                range={{
                  startDate: analytics.startDate,
                  endDate: analytics.endDate,
                }}
                onChangeRange={(range) =>
                  onChangeQuery({
                    ...range,
                    scope: analytics.selectedScope,
                    page: undefined,
                  })
                }
              />
              <Button asChild variant="outline">
                <Link
                  to="/app/analytics/overview"
                  search={{ scope: analytics.selectedScope }}
                >
                  Overview
                </Link>
              </Button>
              {singleSelectedMemberId && (
                <div className="min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
                  <MemberExportButton
                    memberId={singleSelectedMemberId}
                    defaultStartDate={analytics.startDate}
                    defaultEndDate={analytics.endDate}
                  />
                </div>
              )}
              <div className="min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
                <BulkExportButton
                  state={state}
                  defaultStartDate={analytics.startDate}
                  defaultEndDate={analytics.endDate}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <div className="no-print">
        <AnalyticsFilterBar
          state={state}
          filters={draftFilters}
          selectedScope={analytics.selectedScope}
          onChange={handleFilterChange}
          onSearch={handleSearch}
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
        pageSize={pageSize}
        onPageChange={(p) => onChangeQuery({ page: p })}
        onPageSizeChange={(nextPageSize) =>
          onChangeQuery({ pageSize: nextPageSize, page: undefined })
        }
        timezone={analytics.timezone}
      />

      <PrintEntriesTable analytics={analytics} />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: landscape; margin: 1cm; }
          table { table-layout: fixed; }
          th, td { overflow-wrap: anywhere; vertical-align: top; }
        }
      `}</style>
    </div>
  )
}

function PrintEntriesTable({ analytics }: { analytics: AnalyticsPayload }) {
  return (
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
            <th className="px-2 py-1.5 text-left font-bold">Start</th>
            <th className="px-2 py-1.5 text-left font-bold">End</th>
            <th className="px-2 py-1.5 text-left font-bold">Member</th>
            <th className="px-2 py-1.5 text-left font-bold">Project</th>
            <th className="px-2 py-1.5 text-left font-bold">Client</th>
            <th className="px-2 py-1.5 text-left font-bold">Tags</th>
            <th className="px-2 py-1.5 text-left font-bold">Description</th>
            <th className="px-2 py-1.5 text-right font-bold">Duration</th>
            <th className="px-2 py-1.5 text-center font-bold">Billable</th>
            <th className="px-2 py-1.5 text-right font-bold">Rate/hr</th>
            <th className="px-2 py-1.5 text-right font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {analytics.entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border/50">
              <td className="px-2 py-1.5 whitespace-nowrap">{entry.date}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {formatClockTime(entry.startedAt, analytics.timezone)}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {entry.endedAt
                  ? formatClockTime(entry.endedAt, analytics.timezone)
                  : 'Now'}
              </td>
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
                {formatDurationDdhms(entry.durationSeconds)}
              </td>
              <td className="px-2 py-1.5 text-center">
                {entry.billable ? 'Yes' : 'No'}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                {entry.billable && entry.effectiveRate != null
                  ? formatDecimalRate(entry.effectiveRate)
                  : ''}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                {entry.billableAmount != null
                  ? formatMoney(entry.billableAmount, analytics.currency)
                  : ''}
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
  )
}

function formatClockTime(value: string, timezone: string): string {
  return new Date(value).toLocaleTimeString([], {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
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
