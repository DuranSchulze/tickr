import type { DepartmentProjectBreakdown as ProjectRow } from '#/lib/server/tracker/department-dashboard.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import { EmptyChart, formatHours } from './DepartmentChartUtils'
import { DepartmentSectionFrame } from './DepartmentSectionFrame'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function DepartmentProjectBreakdown({
  projects,
  topProjects,
  pagination,
  currency,
  onPageChange,
}: {
  projects: ProjectRow[]
  topProjects: ProjectRow[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  currency: string
  onPageChange: (page: number) => void
}) {
  const chartData = topProjects
  const maxSeconds = Math.max(...chartData.map((project) => project.seconds), 1)
  const firstProject =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1
  const lastProject = Math.min(
    pagination.total,
    (pagination.page - 1) * pagination.pageSize + projects.length,
  )

  return (
    <DepartmentSectionFrame
      title="Project Breakdown"
      subtitle={`${pagination.total.toLocaleString()} project${pagination.total !== 1 ? 's' : ''} tracked`}
      bodyClassName="p-0"
    >
      <>
        <div className="border-b border-border p-4">
          {chartData.length === 0 ? (
            <EmptyChart label="Projects will appear after entries are completed." />
          ) : (
            <div className="grid gap-3">
              {chartData.map((project) => {
                const width = Math.max(5, (project.seconds / maxSeconds) * 100)
                return (
                  <div
                    key={project.projectId}
                    className="grid min-w-0 gap-2 lg:grid-cols-[220px_minmax(0,1fr)_96px] lg:items-center"
                    title={`${project.name} · ${project.clientName}: ${formatHours(project.seconds)} total, ${formatHours(project.billableSeconds)} billable`}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color }}
                        />
                        <p className="m-0 truncate text-sm font-bold text-foreground">
                          {project.name}
                        </p>
                      </div>
                      <p className="m-0 truncate pl-4 text-xs text-muted-foreground">
                        {project.clientName}
                      </p>
                    </div>
                    <div className="h-4 min-w-0 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${width}%`,
                          backgroundColor: project.color,
                        }}
                      />
                    </div>
                    <p className="m-0 text-right text-xs font-mono font-semibold text-foreground">
                      {formatHours(project.seconds)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {projects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Project
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Hours
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Billable Hrs
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Amount
                  </th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Members
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((project) => (
                  <tr
                    key={project.projectId}
                    className="transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="text-sm font-medium text-foreground">
                          {project.name}
                        </span>
                      </div>
                      <p className="m-0 mt-1 pl-4 text-xs text-muted-foreground">
                        {project.clientName}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono font-semibold text-foreground">
                      {formatHours(project.seconds)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono text-foreground">
                      {formatHours(project.billableSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono font-semibold text-foreground">
                      {project.billableAmount > 0
                        ? formatCurrency(project.billableAmount, currency)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {project.memberCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No project rows on this page.
          </p>
        )}

        {pagination.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
            <span className="text-xs text-muted-foreground">
              Showing {firstProject.toLocaleString()}-
              {lastProject.toLocaleString()} of{' '}
              {pagination.total.toLocaleString()} · Page {pagination.page} of{' '}
              {pagination.totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => onPageChange(pagination.page - 1)}
                aria-label="Previous project page"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => onPageChange(pagination.page + 1)}
                aria-label="Next project page"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </>
    </DepartmentSectionFrame>
  )
}
