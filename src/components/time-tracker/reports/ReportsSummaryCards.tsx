import { formatMoney } from '#/lib/time-tracker/export-utils'
import { formatDurationDdhms } from '#/lib/time-tracker/store'
import type { ReportsPayload } from '#/lib/server/tracker/reports.server'

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
      <StatCard
        label="Total time"
        value={formatDurationDdhms(summary.totalSeconds)}
        mono
      />
      <StatCard
        label="Billable %"
        value={`${billablePercent}%`}
        subtitle={formatDurationDdhms(summary.billableSeconds)}
        mono
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
  mono = false,
}: {
  label: string
  value: string
  subtitle?: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`m-0 mt-1 text-2xl font-black tracking-tight text-foreground ${
          mono ? 'font-mono tabular-nums tracking-normal' : ''
        }`}
      >
        {value}
      </p>
      {subtitle && (
        <p
          className={`m-0 mt-0.5 text-sm text-muted-foreground ${
            mono ? 'font-mono tabular-nums' : ''
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
