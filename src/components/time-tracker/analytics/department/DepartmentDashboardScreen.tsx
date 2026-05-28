import type { DepartmentDashboard } from '#/lib/server/tracker/department-dashboard.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import { AnalyticsDateRange } from '../AnalyticsDateRange'
import { MemberBreakdownTable } from './MemberBreakdownTable'
import { DepartmentProjectBreakdown } from './DepartmentProjectBreakdown'
import { DepartmentDailyChart } from './DepartmentDailyChart'

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="m-0 mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function DepartmentDashboardScreen({
  dashboard,
  startDate,
  endDate,
  onChangeRange,
}: {
  dashboard: DepartmentDashboard
  startDate: string
  endDate: string
  onChangeRange: (startDate: string, endDate: string) => void
}) {
  const {
    department,
    summary,
    membersBreakdown,
    projectsBreakdown,
    dailyTotals,
    topTags,
  } = dashboard
  const utilization =
    summary.totalSeconds === 0
      ? 0
      : Math.round((summary.billableSeconds / summary.totalSeconds) * 100)

  const activeMembers = membersBreakdown.filter(
    (m) => m.totalSeconds > 0,
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p
            className="m-0 text-sm font-semibold"
            style={{ color: department.color }}
          >
            Department Analytics
          </p>
          <h1 className="m-0 mt-1 text-2xl font-bold text-foreground">
            {department.name}
          </h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {department.memberCount} member
            {department.memberCount !== 1 ? 's' : ''}
          </p>
        </div>
        <AnalyticsDateRange
          range={{ startDate, endDate }}
          onChangeRange={(r) => onChangeRange(r.startDate, r.endDate)}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total hours"
          value={formatHours(summary.totalSeconds)}
        />
        <KpiCard
          label="Billable hours"
          value={formatHours(summary.billableSeconds)}
        />
        <KpiCard
          label="Billable amount"
          value={formatCurrency(summary.totalBillableAmount, summary.currency)}
        />
        <KpiCard
          label="Active members"
          value={String(activeMembers)}
          sub={`of ${department.memberCount} total`}
        />
        <KpiCard
          label="Utilization"
          value={`${utilization}%`}
          sub="billable / total"
        />
      </div>

      {/* Daily chart */}
      {dailyTotals.length > 0 && (
        <DepartmentDailyChart dailyTotals={dailyTotals} />
      )}

      {/* Member breakdown */}
      <MemberBreakdownTable
        members={membersBreakdown}
        currency={summary.currency}
      />

      {/* Project breakdown */}
      {projectsBreakdown.length > 0 && (
        <DepartmentProjectBreakdown
          projects={projectsBreakdown}
          currency={summary.currency}
        />
      )}

      {/* Top tags */}
      {topTags.length > 0 && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="m-0 text-base font-bold text-foreground">
              Top Tags
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            {topTags.map((tag) => (
              <span
                key={tag.tagId}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
                <span className="text-muted-foreground">
                  {formatHours(tag.seconds)}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
