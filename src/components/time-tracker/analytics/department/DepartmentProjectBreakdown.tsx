import type { DepartmentProjectBreakdown as ProjectRow } from '#/lib/server/tracker/department-dashboard.server'
import { formatCurrency } from '#/lib/time-tracker/billing'

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function DepartmentProjectBreakdown({
  projects,
  currency,
}: {
  projects: ProjectRow[]
  currency: string
}) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="m-0 text-base font-bold text-foreground">
          Project Breakdown
        </h2>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? 's' : ''} tracked
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
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
            {projects.map((p) => (
              <tr
                key={p.projectId}
                className="transition-colors hover:bg-muted/20"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {p.name}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono font-semibold text-foreground">
                  {formatHours(p.seconds)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono text-foreground">
                  {formatHours(p.billableSeconds)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono font-semibold text-foreground">
                  {p.billableAmount > 0
                    ? formatCurrency(p.billableAmount, currency)
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                  {p.memberCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
