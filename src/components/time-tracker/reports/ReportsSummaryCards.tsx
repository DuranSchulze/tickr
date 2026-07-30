import { formatMoney } from '#/lib/time-tracker/export-utils'
import type { ReportsPayload } from '#/lib/server/tracker/reports.server'

function formatHours(seconds: number) {
  const hours = seconds / 3600
  if (hours === 0) return '0h'
  if (hours < 1) return `${Math.round(seconds / 60)}m`
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`
}

export function ReportsSummaryCards({
  summary,
  currency,
}: {
  summary: ReportsPayload['summary']
  currency: string
}) {
  const billablePercent =
    summary.totalSeconds > 0
      ? Math.round((summary.billableSeconds / summary.totalSeconds) * 100)
      : 0

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total hours" value={formatHours(summary.totalSeconds)} />
      <StatCard
        label="Billable %"
        value={`${billablePercent}%`}
        subtitle={formatHours(summary.billableSeconds)}
      />
      <StatCard
        label="Entries"
        value={String(summary.entryCount)}
        subtitle={
          summary.activeMembers > 0
            ? `${summary.activeMembers} ${summary.activeMembers === 1 ? 'member' : 'members'}`
            : undefined
        }
      />
      <StatCard
        label="Projects"
        value={String(summary.projectsTouched)}
        subtitle="touched"
      />
      {summary.billableAmount != null && summary.billableAmount > 0 && (
        <div className="sm:col-span-2 lg:col-span-4">
          <StatCard
            label="Billable amount"
            value={formatMoney(summary.billableAmount, currency)}
          />
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-1 text-2xl font-black tracking-tight text-foreground">
        {value}
      </p>
      {subtitle && (
        <p className="m-0 mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  )
}
