import { Clock3, DollarSign, ListChecks, TimerReset, Users } from 'lucide-react'
import type { AnalyticsPayload } from '#/lib/server/tracker.server'
import { formatDuration } from '#/lib/time-tracker/store'

export function AnalyticsSummaryCards({
  summary,
}: {
  summary: AnalyticsPayload['summary']
}) {
  const cards = [
    {
      label: 'Tracked hours',
      value: formatDuration(summary.totalSeconds),
      helper: 'Sum of all completed entries',
      icon: Clock3,
    },
    {
      label: 'Actual hours',
      value: formatDuration(summary.actualSeconds),
      helper:
        summary.overlapSeconds > 0
          ? `${formatDuration(summary.overlapSeconds)} overlapping`
          : 'No overlapping time',
      icon: TimerReset,
    },
    {
      label: 'Billable',
      value: formatDuration(summary.billableSeconds),
      helper: `${formatDuration(summary.nonBillableSeconds)} non-billable`,
      icon: DollarSign,
    },
    {
      label: 'Entries',
      value: summary.entryCount.toLocaleString(),
      helper: 'Tracked tasks',
      icon: ListChecks,
    },
    ...(summary.activeMembers == null
      ? []
      : [
          {
            label: 'Active members',
            value: summary.activeMembers.toLocaleString(),
            helper: 'In this scope',
            icon: Users,
          },
        ]),
  ]

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <section
            key={card.label}
            className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className="m-0 mt-2 break-words text-xl font-black tracking-tight text-foreground sm:text-2xl">
                  {card.value}
                </p>
              </div>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-9">
                <Icon className="size-4" />
              </span>
            </div>
            <p className="m-0 mt-3 text-sm font-medium text-muted-foreground">
              {card.helper}
            </p>
          </section>
        )
      })}
    </div>
  )
}
