import type { DepartmentDashboard } from '#/lib/server/tracker/department-dashboard.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import { AnalyticsDateRange } from '../AnalyticsDateRange'
import { MemberBreakdownTable } from './MemberBreakdownTable'
import { DepartmentProjectBreakdown } from './DepartmentProjectBreakdown'
import { DepartmentDailyChart } from './DepartmentDailyChart'
import { DepartmentTopTagsChart } from './DepartmentTopTagsChart'
import { DepartmentSectionFrame } from './DepartmentSectionFrame'
import { Search, X } from 'lucide-react'
import type { FormEvent } from 'react'

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
  onChangeFilters,
  onChangeProjectPage,
  onViewMember,
}: {
  dashboard: DepartmentDashboard
  startDate: string
  endDate: string
  onChangeRange: (startDate: string, endDate: string) => void
  onChangeFilters: (filters: { departmentId?: string; q?: string }) => void
  onChangeProjectPage: (page: number) => void
  onViewMember: (memberId: string) => void
}) {
  const {
    availableDepartments,
    canFilterDepartments,
    department,
    filters,
    summary,
    membersBreakdown,
    topProjectsBreakdown,
    projectsBreakdown,
    projectsPagination,
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

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const q = String(formData.get('q') ?? '').trim()
    onChangeFilters({
      departmentId: filters.departmentId || undefined,
      q: q || undefined,
    })
  }

  function clearSearch() {
    onChangeFilters({
      departmentId: filters.departmentId || undefined,
      q: undefined,
    })
  }

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

      {canFilterDepartments && (
        <DepartmentSectionFrame
          title="Filters"
          subtitle="Department, member search, and date range"
        >
          <div className="grid gap-3 md:grid-cols-[minmax(180px,260px)_minmax(240px,1fr)] md:items-end">
            <div className="min-w-0 flex flex-col gap-1">
              <label
                htmlFor="department-analytics-department"
                className="text-xs font-semibold text-muted-foreground"
              >
                Department
              </label>
              <select
                id="department-analytics-department"
                value={filters.departmentId}
                onChange={(event) =>
                  onChangeFilters({
                    departmentId: event.target.value || undefined,
                    q: filters.q || undefined,
                  })
                }
                className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">All departments</option>
                {availableDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <form
              key={filters.q}
              onSubmit={applySearch}
              className="min-w-0 flex flex-col gap-1"
            >
              <label
                htmlFor="department-analytics-search"
                className="text-xs font-semibold text-muted-foreground"
              >
                Name or email
              </label>
              <div className="flex min-w-0 gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="department-analytics-search"
                    name="q"
                    type="search"
                    defaultValue={filters.q}
                    placeholder="Search members"
                    className="h-10 w-full min-w-0 rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                {filters.q && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    title="Clear search"
                    aria-label="Clear search"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </DepartmentSectionFrame>
      )}

      {/* KPI cards */}
      <DepartmentSectionFrame
        title="Summary"
        subtitle={`${formatHours(summary.totalSeconds)} total · ${activeMembers} active members`}
      >
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
            value={formatCurrency(
              summary.totalBillableAmount,
              summary.currency,
            )}
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
      </DepartmentSectionFrame>

      {/* Daily chart */}
      {dailyTotals.length > 0 && (
        <DepartmentDailyChart dailyTotals={dailyTotals} />
      )}

      {/* Member breakdown */}
      <MemberBreakdownTable
        members={membersBreakdown}
        currency={summary.currency}
        onViewMember={(member) => onViewMember(member.memberId)}
      />

      {/* Project breakdown */}
      <DepartmentProjectBreakdown
        projects={projectsBreakdown}
        topProjects={topProjectsBreakdown}
        pagination={projectsPagination}
        currency={summary.currency}
        onPageChange={onChangeProjectPage}
      />

      {/* Top tags */}
      <DepartmentTopTagsChart tags={topTags} />
    </div>
  )
}
