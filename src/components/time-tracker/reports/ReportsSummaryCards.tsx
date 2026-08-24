import {
  formatDecimalHours,
  formatMoney,
} from '#/lib/time-tracker/export-utils'
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
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total time"
        durationSeconds={summary.totalSeconds}
        subtitle={`${formatDecimalHours(summary.totalSeconds)} total hours`}
      />
      <StatCard
        label="Billable %"
        value={`${billablePercent}%`}
        subtitle={`${formatDurationDdhms(summary.billableSeconds)} · ${formatDecimalHours(summary.billableSeconds)} hours`}
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
        <div className="sm:col-span-2 xl:col-span-4">
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
  durationSeconds,
  subtitle,
}: {
  label: string
  value?: string
  durationSeconds?: number
  subtitle?: string
}) {
  return (
    <div className="flex min-h-28 min-w-0 flex-col rounded-lg border border-border bg-card p-3 sm:min-h-32 sm:p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {durationSeconds === undefined ? (
        <span className="mt-2 min-w-0 break-words text-[clamp(1.5rem,6vw,1.875rem)] font-black leading-tight tracking-tight text-foreground tabular-nums [overflow-wrap:anywhere]">
          {value}
        </span>
      ) : (
        <DurationValue seconds={durationSeconds} />
      )}
      {subtitle && (
        <p className="m-0 mt-auto min-w-0 break-words pt-3 text-xs font-medium leading-5 text-muted-foreground tabular-nums [overflow-wrap:anywhere] sm:text-sm">
          {subtitle}
        </p>
      )}
    </div>
  )
}

const durationLabels = ['days', 'hours', 'min', 'sec'] as const

function DurationValue({ seconds }: { seconds: number }) {
  const exactDuration = formatDurationDdhms(seconds)
  const segments = exactDuration.split(':')

  return (
    <div
      className="mt-2 grid min-w-0 grid-cols-4 gap-x-1"
      aria-label={`${Number(segments[0])} days, ${Number(segments[1])} hours, ${Number(segments[2])} minutes, ${Number(segments[3])} seconds`}
    >
      {segments.map((segment, index) => (
        <div key={durationLabels[index]} className="min-w-0 text-center">
          <span className="block min-w-0 break-words font-mono text-[clamp(1.125rem,5vw,1.875rem)] font-black leading-none tracking-tight text-foreground tabular-nums [overflow-wrap:anywhere]">
            {segment}
          </span>
          <span className="mt-1 block text-[8px] font-bold uppercase leading-none tracking-normal text-muted-foreground sm:text-[9px] sm:tracking-wide">
            {durationLabels[index]}
          </span>
        </div>
      ))}
    </div>
  )
}
