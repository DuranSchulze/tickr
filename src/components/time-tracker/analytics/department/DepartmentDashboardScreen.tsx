import type { DepartmentDashboard } from '#/lib/server/tracker/department-dashboard.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import { formatDuration } from '#/lib/time-tracker/store'
import { AnalyticsDateRange } from '../AnalyticsDateRange'
import { MemberBreakdownTable } from './MemberBreakdownTable'
import { DepartmentDailyChart } from './DepartmentDailyChart'
import { DepartmentTopTagsChart } from './DepartmentTopTagsChart'
import { DepartmentProjectBreakdown } from './DepartmentProjectBreakdown'
import { DepartmentSectionFrame } from './DepartmentSectionFrame'
import { Combobox } from '#/components/ui/combobox'
import type { ComboboxOption } from '#/components/ui/combobox'

export function buildDepartmentMemberOptions(
  members: DepartmentDashboard['availableMembers'],
  departmentId: string,
): ComboboxOption[] {
  const visibleMembers = departmentId
    ? members.filter((member) => member.departmentId === departmentId)
    : members

  return [
    {
      value: '',
      label: departmentId ? 'All members in department' : 'All members',
    },
    ...visibleMembers.map((member) => ({
      value: member.id,
      label: member.name,
      description: departmentId
        ? member.email
        : [member.email, member.departmentName].filter(Boolean).join(' · '),
    })),
  ]
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
  onViewMember,
  onProjectPageChange,
}: {
  dashboard: DepartmentDashboard
  startDate: string
  endDate: string
  onChangeRange: (startDate: string, endDate: string) => void
  onChangeFilters: (filters: {
    departmentId?: string
    memberId?: string
    q?: string
  }) => void
  onViewMember: (memberId: string) => void
  onProjectPageChange: (page: number) => void
}) {
  const {
    availableDepartments,
    availableMembers,
    canFilterDepartments,
    department,
    filters,
    summary,
    membersBreakdown,
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

      {canFilterDepartments && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
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
                    memberId: undefined,
                    q: undefined,
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

            <div className="min-w-0 flex flex-col gap-1">
              <p className="m-0 text-xs font-semibold text-muted-foreground">
                Member
              </p>
              <Combobox
                value={filters.memberId}
                options={buildDepartmentMemberOptions(
                  availableMembers,
                  filters.departmentId,
                )}
                onValueChange={(memberId) =>
                  onChangeFilters({
                    departmentId: filters.departmentId || undefined,
                    memberId: memberId || undefined,
                    q: undefined,
                  })
                }
                placeholder="All members"
                searchPlaceholder="Search name or email"
                emptyText="No members found."
              />
            </div>
          </div>
        </section>
      )}

      {/* KPI cards */}
      <DepartmentSectionFrame
        title="Summary"
        subtitle={`${formatDuration(summary.totalSeconds)} tracked · ${activeMembers} active members`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Tracked hours"
            value={formatDuration(summary.totalSeconds)}
          />
          <KpiCard
            label="Actual hours"
            value={formatDuration(summary.actualSeconds)}
            sub={
              summary.overlapSeconds > 0
                ? `${formatDuration(summary.overlapSeconds)} overlap`
                : 'No overlap'
            }
          />
          <KpiCard
            label="Billable hours"
            value={formatDuration(summary.billableSeconds)}
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

      {/* Member breakdown */}
      <MemberBreakdownTable
        members={membersBreakdown}
        currency={summary.currency}
        onViewMember={(member) => onViewMember(member.memberId)}
      />

      {/* Daily hours and top tags */}
      <div className="grid gap-6 xl:grid-cols-2">
        <DepartmentDailyChart dailyTotals={dashboard.dailyTotals} />
        <DepartmentTopTagsChart tags={dashboard.topTags} />
      </div>

      {/* Project breakdown */}
      <DepartmentProjectBreakdown
        projects={dashboard.projectsBreakdown}
        topProjects={dashboard.topProjectsBreakdown}
        pagination={dashboard.projectsPagination}
        currency={summary.currency}
        onPageChange={onProjectPageChange}
      />
    </div>
  )
}
